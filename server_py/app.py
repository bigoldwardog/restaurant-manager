import json
import os
import re
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from bson import ObjectId
from pymongo import ReturnDocument

from db import db
from validation import ApiError, clean_rut, public_user, valid_rut

IVA_RATE = 0.19
PRODUCT_KEY = "RM-2026-DEMO"
ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"


def now():
    return datetime.now(timezone.utc)


def oid(value):
    try:
        return ObjectId(str(value))
    except Exception as exc:
        raise ApiError("Identificador invalido.") from exc


def jsonify(value):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [jsonify(item) for item in value]
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            result["id" if key == "_id" else key] = jsonify(item)
        return result
    return value


def totals_for_items(items):
    subtotal = sum(float(item.get("precio_unitario", 0)) * int(item.get("cantidad", 0)) for item in items)
    iva = round(subtotal * IVA_RATE)
    return {"subtotal": int(subtotal), "iva": int(iva), "total": int(subtotal + iva)}


def order_items(order_id):
    return list(db.orden_items.find({"orden_id": oid(order_id)}))


def enrich_order(order):
    if not order:
        return None
    items = order_items(order["_id"])
    enriched_items = []
    for item in items:
        product = db.menu_platos.find_one({"_id": item.get("plato_id")})
        enriched_items.append({
            **item,
            "producto": jsonify({
                "_id": product["_id"],
                "nombre": product.get("nombre"),
                "categoria": product.get("categoria"),
                "precio": product.get("precio"),
            }) if product else None,
        })
    table = db.mesas.find_one({"_id": order.get("mesa_id")})
    waiter = db.personal.find_one({"_id": order.get("mesero_id")}) if order.get("mesero_id") else None
    return jsonify({
        **order,
        "table": table,
        "mesero": public_user(waiter),
        "items": enriched_items,
        "totals": totals_for_items(items),
    })


def require_user(user_id):
    user = db.personal.find_one({"_id": oid(user_id)})
    if not user:
        raise ApiError("Usuario no encontrado.", 404)
    return user


def require_open_order(order_id):
    order = db.ordenes.find_one({"_id": oid(order_id)})
    if not order:
        raise ApiError("Orden no encontrada.", 404)
    if order.get("estado") != "abierta":
        raise ApiError("La orden no esta abierta.")
    return order


def active_order_by_table(table_id):
    return db.ordenes.find_one({"mesa_id": oid(table_id), "estado": "abierta"})


def branch_order_ids(branch_id):
    return [order["_id"] for order in db.ordenes.find({"sucursal_id": oid(branch_id)})]


def login(body):
    rut = clean_rut(body.get("rut"))
    role = str(body.get("rol") or "").lower()
    if role not in ("gerente", "mesero", "cocinero"):
        raise ApiError("Seleccione un cargo valido.")
    if not valid_rut(rut):
        raise ApiError("El RUT ingresado no es valido.")
    user = db.personal.find_one({"rut": rut, "rol": role, "estado": "activo"})
    if not user or user.get("clave") != body.get("clave"):
        raise ApiError("Credenciales incorrectas.", 403)
    return {"user": jsonify(public_user(user))}


def register(body):
    rut = clean_rut(body.get("rut"))
    role = str(body.get("rol") or "").lower()
    name = str(body.get("nombre") or "").strip()
    password = str(body.get("clave") or "")
    if role not in ("gerente", "mesero", "cocinero"):
        raise ApiError("Seleccione un cargo valido.")
    if not valid_rut(rut):
        raise ApiError("El RUT ingresado no es valido.")
    if len(name) < 3:
        raise ApiError("Ingrese un nombre valido.")
    if len(password) < 6:
        raise ApiError("La clave debe tener al menos 6 caracteres.")
    if password != body.get("confirmacion"):
        raise ApiError("Las claves no coinciden.")
    if body.get("productKey") != PRODUCT_KEY:
        raise ApiError("La key de producto no es valida.", 403)
    if db.personal.find_one({"rut": rut}):
        raise ApiError("Ya existe un usuario con ese RUT.")
    branch = db.sucursales.find_one({"estado": "activa"})
    user = {
        "sucursal_id": branch["_id"],
        "nombre": name,
        "rol": role,
        "rut": rut,
        "clave": password,
        "email": "",
        "estado": "activo",
    }
    result = db.personal.insert_one(user)
    user["_id"] = result.inserted_id
    return {"user": jsonify(public_user(user))}


def recover(body):
    if not valid_rut(body.get("rut")):
        raise ApiError("El RUT ingresado no es valido.")
    return {"message": "Solicitud registrada. Contacte a un administrador del sistema para restablecer la clave."}


def bootstrap(query):
    user = require_user(query.get("userId"))
    if user.get("rol") == "gerente":
        branches = list(db.sucursales.find({"estado": "activa"}))
    else:
        branches = list(db.sucursales.find({"_id": user.get("sucursal_id"), "estado": "activa"}))
    return {"branches": jsonify(branches), "user": jsonify(public_user(user)), "productKeyHint": PRODUCT_KEY}


def dashboard(query):
    user = require_user(query.get("userId"))
    branch_id = oid(query.get("branchId"))
    branch = db.sucursales.find_one({"_id": branch_id})
    if not branch:
        raise ApiError("Sucursal no encontrada.", 404)
    if user.get("rol") != "gerente" and user.get("sucursal_id") != branch_id:
        raise ApiError("No puede consultar otra sucursal.", 403)
    tables = list(db.mesas.find({"sucursal_id": branch_id}))
    open_orders = list(db.ordenes.find({"sucursal_id": branch_id, "estado": "abierta"}))
    all_order_ids = branch_order_ids(branch_id)
    open_payments = list(db.pagos.find({"orden_id": {"$in": all_order_ids}, "cierre_id": None}))
    rows = []
    for table in tables:
        order = next((entry for entry in open_orders if entry.get("mesa_id") == table["_id"]), None)
        waiter = db.personal.find_one({"_id": order.get("mesero_id")}) if order and order.get("mesero_id") else None
        items = order_items(order["_id"]) if order else []
        rows.append({
            "mesa_id": str(table["_id"]),
            "numero_mesa": table.get("numero_mesa"),
            "capacidad": table.get("capacidad"),
            "estado": table.get("estado"),
            "clientes": None if table.get("estado") == "libre" else table.get("capacidad"),
            "mesero": waiter.get("nombre") if waiter else None,
            "hora_inicio": jsonify(order.get("fecha_hora_inicio")) if order else None,
            "monto": totals_for_items(items)["total"] if order else None,
            "orden_id": str(order["_id"]) if order else None,
            "pagada": False,
        })
    pending = 0
    for order in open_orders:
        pending += db.orden_items.count_documents({"orden_id": order["_id"], "estado": {"$in": ["pendiente", "preparando"]}})
    return {
        "branch": jsonify(branch),
        "kpis": {
            "disponibles": sum(1 for table in tables if table.get("estado") == "libre"),
            "ocupadas": sum(1 for table in tables if table.get("estado") in ("ocupada", "pagando")),
            "ingresos": sum(int(payment.get("monto", 0)) for payment in open_payments),
            "pendientes_cocina": pending,
        },
        "rows": rows,
    }


def menu(query):
    criteria = {"sucursal_id": oid(query.get("branchId"))}
    if query.get("category"):
        criteria["categoria"] = query.get("category")
    if query.get("search"):
        criteria["nombre"] = {"$regex": re.escape(query.get("search")), "$options": "i"}
    return jsonify(list(db.menu_platos.find(criteria)))


def order_for_table(params):
    table = db.mesas.find_one({"_id": oid(params[0])})
    if not table:
        raise ApiError("Mesa no encontrada.", 404)
    order = active_order_by_table(params[0])
    return {"table": jsonify(table), "order": enrich_order(order)}


def create_order(body):
    user = require_user(body.get("userId"))
    branch_id = oid(body.get("branchId"))
    table_id = oid(body.get("tableId"))
    table = db.mesas.find_one({"_id": table_id, "sucursal_id": branch_id})
    if not table:
        raise ApiError("Mesa no encontrada.", 404)
    if user.get("rol") not in ("gerente", "mesero"):
        raise ApiError("El usuario no puede crear ordenes.", 403)
    if user.get("rol") != "gerente" and user.get("sucursal_id") != branch_id:
        raise ApiError("El mesero solo puede operar su sucursal.", 403)
    if active_order_by_table(table_id):
        raise ApiError("La mesa ya tiene una orden abierta.")
    order = {
        "sucursal_id": branch_id,
        "mesa_id": table_id,
        "mesero_id": user["_id"],
        "fecha_hora_inicio": now(),
        "fecha_hora_cierre": None,
        "estado": "abierta",
        "total": 0,
        "observaciones": "",
        "cliente": "",
    }
    result = db.ordenes.insert_one(order)
    order["_id"] = result.inserted_id
    db.mesas.update_one({"_id": table_id}, {"$set": {"estado": "ocupada"}})
    return enrich_order(order)


def add_item(params, body):
    order = require_open_order(params[0])
    product = db.menu_platos.find_one({"_id": oid(body.get("productId")), "sucursal_id": order.get("sucursal_id")})
    if not product:
        raise ApiError("Producto no encontrado.", 404)
    if not product.get("disponible", True):
        raise ApiError("El producto no esta disponible.")
    quantity = int(body.get("cantidad", 1))
    if quantity < 1:
        raise ApiError("La cantidad debe ser mayor a cero.")
    existing = db.orden_items.find_one({"orden_id": order["_id"], "plato_id": product["_id"], "estado": {"$ne": "cancelado"}})
    if existing:
        db.orden_items.update_one({"_id": existing["_id"]}, {"$inc": {"cantidad": quantity}})
    else:
        db.orden_items.insert_one({
            "orden_id": order["_id"],
            "plato_id": product["_id"],
            "cantidad": quantity,
            "precio_unitario": product.get("precio", 0),
            "observaciones": body.get("observaciones") or "",
            "estado": "pendiente",
            "fecha_creacion": now(),
        })
    refreshed = db.ordenes.find_one({"_id": order["_id"]})
    update_order_total(refreshed["_id"])
    return enrich_order(refreshed)


def remove_item(params):
    order = require_open_order(params[0])
    result = db.orden_items.delete_one({"_id": oid(params[1]), "orden_id": order["_id"]})
    if result.deleted_count == 0:
        raise ApiError("Item no encontrado.", 404)
    update_order_total(order["_id"])
    return enrich_order(db.ordenes.find_one({"_id": order["_id"]}))


def update_order(params, body):
    order = require_open_order(params[0])
    updates = {}
    if "observaciones" in body:
        updates["observaciones"] = str(body.get("observaciones") or "")
    if "cliente" in body:
        updates["cliente"] = str(body.get("cliente") or "")
    if updates:
        db.ordenes.update_one({"_id": order["_id"]}, {"$set": updates})
    return enrich_order(db.ordenes.find_one({"_id": order["_id"]}))


def send_kitchen(params):
    order = require_open_order(params[0])
    if db.orden_items.count_documents({"orden_id": order["_id"]}) == 0:
        raise ApiError("No puede enviar una comanda vacia.")
    db.orden_items.update_many({"orden_id": order["_id"], "estado": {"$nin": ["servido", "cancelado"]}}, {"$set": {"estado": "pendiente"}})
    db.mesas.update_one({"_id": order["mesa_id"]}, {"$set": {"estado": "ocupada"}})
    return enrich_order(db.ordenes.find_one({"_id": order["_id"]}))


def cancel_order(params, body):
    order = require_open_order(params[0])
    require_user(body.get("userId"))
    db.ordenes.update_one({"_id": order["_id"]}, {"$set": {"estado": "cancelada", "fecha_hora_cierre": now()}})
    db.mesas.update_one({"_id": order["mesa_id"]}, {"$set": {"estado": "libre"}})
    return enrich_order(db.ordenes.find_one({"_id": order["_id"]}))


def kitchen(query):
    user = require_user(query.get("userId"))
    branch_id = oid(query.get("branchId"))
    if user.get("rol") != "cocinero":
        raise ApiError("Solo cocina puede consultar este tablero.", 403)
    if user.get("sucursal_id") != branch_id:
        raise ApiError("El cocinero solo puede ver su sucursal.", 403)
    order_ids = db.orden_items.distinct("orden_id", {"estado": {"$in": ["pendiente", "preparando", "listo"]}})
    orders = list(db.ordenes.find({"_id": {"$in": order_ids}, "sucursal_id": branch_id, "estado": "abierta"}))
    return {"orders": [enrich_order(order) for order in orders]}


def kitchen_update(params, body):
    order = require_open_order(params[0])
    status = body.get("estado")
    if status not in ("pendiente", "preparando", "listo", "servido"):
        raise ApiError("Estado de cocina invalido.")
    db.orden_items.update_many({"orden_id": order["_id"], "estado": {"$ne": "cancelado"}}, {"$set": {"estado": status}})
    return enrich_order(db.ordenes.find_one({"_id": order["_id"]}))


def add_payment(body):
    order = require_open_order(body.get("orderId"))
    method = body.get("metodo_pago")
    if method not in ("efectivo", "tarjeta", "transferencia", "cheque"):
        raise ApiError("Metodo de pago invalido.")
    total = totals_for_items(order_items(order["_id"]))["total"]
    amount = int(body.get("monto") or total)
    if amount <= 0:
        raise ApiError("Monto de pago invalido.")
    payment = {
        "orden_id": order["_id"],
        "monto": amount,
        "metodo_pago": method,
        "fecha_pago": now(),
        "referencia": body.get("referencia"),
        "cierre_id": None,
    }
    result = db.pagos.insert_one(payment)
    payment["_id"] = result.inserted_id
    db.ordenes.update_one({"_id": order["_id"]}, {"$set": {"estado": "pagada", "fecha_hora_cierre": now(), "total": amount}})
    db.mesas.update_one({"_id": order["mesa_id"]}, {"$set": {"estado": "libre"}})
    return {"payment": jsonify(payment), "order": enrich_order(db.ordenes.find_one({"_id": order["_id"]}))}


def report_for_branch(branch_id):
    order_ids = branch_order_ids(branch_id)
    payments = list(db.pagos.find({"orden_id": {"$in": order_ids}, "cierre_id": None}))
    paid_order_ids = {payment["orden_id"] for payment in payments}
    methods = {}
    for payment in payments:
        methods[payment.get("metodo_pago")] = methods.get(payment.get("metodo_pago"), 0) + int(payment.get("monto", 0))
    products = {}
    for item in db.orden_items.find({"orden_id": {"$in": list(paid_order_ids)}}):
        product = db.menu_platos.find_one({"_id": item.get("plato_id")})
        if not product:
            continue
        key = str(product["_id"])
        products.setdefault(key, {"nombre": product.get("nombre"), "cantidad": 0, "ingresos": 0})
        products[key]["cantidad"] += int(item.get("cantidad", 0))
        products[key]["ingresos"] += int(item.get("cantidad", 0)) * int(item.get("precio_unitario", 0))
    return {
        "total_ventas": sum(int(payment.get("monto", 0)) for payment in payments),
        "transacciones": len(payments),
        "metodos": methods,
        "top_platos": sorted(products.values(), key=lambda item: item["ingresos"], reverse=True)[:5],
        "cierres": jsonify(list(db.cierre_caja.find({"sucursal_id": oid(branch_id)}).sort("fecha_hora", -1).limit(5))),
        "tipo_cambio": [
            {"moneda": "USD", "valor": 945},
            {"moneda": "EUR", "valor": 1028},
            {"moneda": "BRL", "valor": 174},
        ],
    }


def reports(query):
    user = require_user(query.get("userId"))
    if user.get("rol") != "gerente":
        raise ApiError("Solo el gerente puede consultar reportes.", 403)
    return report_for_branch(query.get("branchId"))


def close_cash(body):
    user = require_user(body.get("userId"))
    branch_id = oid(body.get("branchId"))
    if user.get("rol") != "gerente":
        raise ApiError("Solo el gerente puede cerrar caja.", 403)
    if db.ordenes.count_documents({"sucursal_id": branch_id, "estado": "abierta"}) > 0:
        raise ApiError("No puede cerrar caja con ordenes abiertas.")
    report = report_for_branch(str(branch_id))
    if report["transacciones"] == 0:
        raise ApiError("No hay transacciones pendientes para cerrar.")
    closing = {
        "sucursal_id": branch_id,
        "responsable_id": user["_id"],
        "fecha": now().date().isoformat(),
        "fecha_hora": now(),
        "total_ventas": report["total_ventas"],
        "transacciones": report["transacciones"],
        "metodos": report["metodos"],
        "top_platos": report["top_platos"],
        "tipo_cambio": report["tipo_cambio"],
    }
    result = db.cierre_caja.insert_one(closing)
    closing["_id"] = result.inserted_id
    db.pagos.update_many({"orden_id": {"$in": branch_order_ids(str(branch_id))}, "cierre_id": None}, {"$set": {"cierre_id": closing["_id"]}})
    return {"cierre": jsonify(closing), "report": report_for_branch(str(branch_id))}


def update_order_total(order_id):
    total = totals_for_items(order_items(order_id))["total"]
    db.ordenes.update_one({"_id": oid(order_id)}, {"$set": {"total": total}})


ROUTES = [
    ("POST", re.compile(r"^/api/auth/login$"), lambda params, query, body: login(body)),
    ("POST", re.compile(r"^/api/auth/register$"), lambda params, query, body: register(body)),
    ("POST", re.compile(r"^/api/auth/recover$"), lambda params, query, body: recover(body)),
    ("GET", re.compile(r"^/api/bootstrap$"), lambda params, query, body: bootstrap(query)),
    ("GET", re.compile(r"^/api/dashboard$"), lambda params, query, body: dashboard(query)),
    ("GET", re.compile(r"^/api/menu$"), lambda params, query, body: menu(query)),
    ("GET", re.compile(r"^/api/orders/table/([^/]+)$"), lambda params, query, body: order_for_table(params)),
    ("POST", re.compile(r"^/api/orders$"), lambda params, query, body: create_order(body)),
    ("POST", re.compile(r"^/api/orders/([^/]+)/items$"), lambda params, query, body: add_item(params, body)),
    ("DELETE", re.compile(r"^/api/orders/([^/]+)/items/([^/]+)$"), lambda params, query, body: remove_item(params)),
    ("PATCH", re.compile(r"^/api/orders/([^/]+)$"), lambda params, query, body: update_order(params, body)),
    ("POST", re.compile(r"^/api/orders/([^/]+)/send-kitchen$"), lambda params, query, body: send_kitchen(params)),
    ("POST", re.compile(r"^/api/orders/([^/]+)/cancel$"), lambda params, query, body: cancel_order(params, body)),
    ("GET", re.compile(r"^/api/kitchen$"), lambda params, query, body: kitchen(query)),
    ("PATCH", re.compile(r"^/api/kitchen/orders/([^/]+)$"), lambda params, query, body: kitchen_update(params, body)),
    ("POST", re.compile(r"^/api/payments$"), lambda params, query, body: add_payment(body)),
    ("GET", re.compile(r"^/api/reports$"), lambda params, query, body: reports(query)),
    ("POST", re.compile(r"^/api/cash-close$"), lambda params, query, body: close_cash(body)),
]


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.respond(204, {})

    def do_GET(self):
        self.dispatch()

    def do_POST(self):
        self.dispatch()

    def do_PATCH(self):
        self.dispatch()

    def do_DELETE(self):
        self.dispatch()

    def dispatch(self):
        try:
            parsed = urlparse(self.path)
            if parsed.path.startswith("/api/"):
                self.handle_api(parsed)
            else:
                self.handle_static(parsed.path)
        except ApiError as exc:
            self.respond(exc.status, {"error": str(exc)})
        except Exception as exc:
            self.respond(500, {"error": str(exc)})

    def handle_api(self, parsed):
        for method, pattern, handler in ROUTES:
            match = pattern.match(parsed.path)
            if self.command == method and match:
                query = {key: values[-1] for key, values in parse_qs(parsed.query).items()}
                body = self.read_json()
                payload = handler([unquote(item) for item in match.groups()], query, body)
                self.respond(200, payload)
                return
        self.respond(404, {"error": "Ruta no encontrada"})

    def read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def respond(self, status, payload):
        body = json.dumps(jsonify(payload), ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if status != 204:
            self.wfile.write(body)

    def handle_static(self, path):
        target = "index.html" if path == "/" else path.lstrip("/")
        file_path = DIST / target
        if not file_path.exists():
            file_path = DIST / "index.html"
        if not file_path.exists():
            self.respond(404, {"error": "Build no encontrado. Ejecute npm run build."})
            return
        content = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type(file_path))
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format, *args):
        return


def content_type(path):
    return {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
    }.get(path.suffix, "application/octet-stream")


if __name__ == "__main__":
    host = os.getenv("API_HOST", "127.0.0.1")
    port = int(os.getenv("API_PORT", "4000"))
    print(f"RestaurantManager PyMongo API escuchando en http://{host}:{port}")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
