from bson import ObjectId
from db import db


def fix_text(value):
    if not isinstance(value, str):
        return value
    replacements = {
        "BiobÃ­o": "Biobio",
        "ConcepciÃ³n": "Concepcion",
        "Carlos GarcÃ­a": "Carlos Garcia",
        "MarÃ­a LÃ³pez": "Maria Lopez",
        "jamÃ³n": "jamon",
        "menÃº": "menu",
    }
    return replacements.get(value, value)


def normalize_texts():
    for collection_name in ("sucursales", "menu_platos", "personal", "orden_items"):
        for document in db[collection_name].find():
            updates = {}
            for key, value in document.items():
                fixed = fix_text(value)
                if fixed != value:
                    updates[key] = fixed
            if updates:
                db[collection_name].update_one({"_id": document["_id"]}, {"$set": updates})


def prepare_staff():
    credentials = {
        ObjectId("507f1f77bcf86cd799439050"): {"rut": "11111111-1", "clave": "admin123"},
        ObjectId("507f1f77bcf86cd799439051"): {"rut": "44444444-4", "clave": "admin123"},
        ObjectId("507f1f77bcf86cd799439060"): {"rut": "22222222-2", "clave": "mesero123"},
    }
    for _id, data in credentials.items():
        db.personal.update_one({"_id": _id}, {"$set": data})
    if not db.personal.find_one({"rol": "cocinero"}):
        db.personal.insert_one({
            "_id": ObjectId("507f1f77bcf86cd799439061"),
            "sucursal_id": ObjectId("507f1f77bcf86cd799439011"),
            "nombre": "Camila Fuentes",
            "rol": "cocinero",
            "rut": "33333333-3",
            "clave": "cocina123",
            "email": "cocina@restaurant.com",
            "estado": "activo",
        })


def normalize_reservations():
    db.mesas.update_many({"estado": "reservada"}, {"$set": {"estado": "libre"}})
    db.ordenes.update_many({"estado": "reservada"}, {"$set": {"estado": "cancelada"}})


def sync_table_states():
    db.mesas.update_many({"estado": {"$nin": ["libre", "ocupada", "pagando"]}}, {"$set": {"estado": "libre"}})
    valid_table_ids = {table["_id"] for table in db.mesas.find()}
    open_orders = list(db.ordenes.find({"estado": "abierta"}))
    for order in open_orders:
        if order.get("mesa_id") in valid_table_ids:
            db.mesas.update_one({"_id": order["mesa_id"]}, {"$set": {"estado": "ocupada"}})
    paid_orders = db.ordenes.find({"estado": "pagada"})
    for order in paid_orders:
        if order.get("mesa_id") in valid_table_ids:
            db.mesas.update_one({"_id": order["mesa_id"]}, {"$set": {"estado": "libre"}})


def add_runtime_fields():
    db.pagos.update_many({"cierre_id": {"$exists": False}}, {"$set": {"cierre_id": None}})
    db.ordenes.update_many({"cliente": {"$exists": False}}, {"$set": {"cliente": ""}})


def main():
    normalize_texts()
    prepare_staff()
    normalize_reservations()
    sync_table_states()
    add_runtime_fields()
    print("Base RestaurantManager preparada para la API PyMongo.")


if __name__ == "__main__":
    main()
