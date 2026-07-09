import { store } from './store.js'
import { badRequest, cleanRut, forbidden, isValidRut, normalizeRole, notFound, publicUser } from './validation.js'

const ivaRate = 0.19

export function orderSubtotal(order) {
  return order.items.reduce((total, item) => total + item.precio_unitario * item.cantidad, 0)
}

export function orderTotals(order) {
  const subtotal = orderSubtotal(order)
  const iva = Math.round(subtotal * ivaRate)
  return { subtotal, iva, total: subtotal + iva }
}

export function findOpenOrderByTable(tableId) {
  return store.orders.find((order) => order.mesa_id === tableId && order.estado === 'abierta')
}

export function login({ rut, clave, rol }) {
  const normalizedRole = normalizeRole(rol)
  if (!normalizedRole) throw badRequest('Seleccione un cargo valido.')
  if (!isValidRut(rut)) throw badRequest('El RUT ingresado no es valido.')
  const user = store.staff.find((person) => cleanRut(person.rut) === cleanRut(rut) && person.rol === normalizedRole && person.estado === 'activo')
  if (!user || user.clave !== clave) throw forbidden('Credenciales incorrectas.')
  return { user: publicUser(user) }
}

export function register({ rut, clave, confirmacion, nombre, rol, productKey }) {
  const normalizedRole = normalizeRole(rol)
  if (!normalizedRole) throw badRequest('Seleccione un cargo valido.')
  if (!isValidRut(rut)) throw badRequest('El RUT ingresado no es valido.')
  if (!nombre || String(nombre).trim().length < 3) throw badRequest('Ingrese un nombre valido.')
  if (!clave || clave.length < 6) throw badRequest('La clave debe tener al menos 6 caracteres.')
  if (clave !== confirmacion) throw badRequest('Las claves no coinciden.')
  if (productKey !== store.productKey) throw forbidden('La key de producto no es valida.')
  if (store.staff.some((person) => cleanRut(person.rut) === cleanRut(rut))) throw badRequest('Ya existe un usuario con ese RUT.')
  const branch = store.branches.find((item) => item.estado === 'activa')
  const user = {
    id: store.createId('per'),
    sucursal_id: branch.id,
    nombre: String(nombre).trim(),
    rol: normalizedRole,
    rut: cleanRut(rut),
    clave,
    email: '',
    estado: 'activo',
  }
  store.staff.push(user)
  return { user: publicUser(user) }
}

export function recoverPassword({ rut }) {
  if (!isValidRut(rut)) throw badRequest('El RUT ingresado no es valido.')
  return { message: 'Solicitud registrada. Contacte a un administrador del sistema para restablecer la clave.' }
}

export function getBootstrap(userId) {
  const user = store.staff.find((person) => person.id === userId)
  if (!user) throw notFound('Usuario no encontrado.')
  return {
    branches: user.rol === 'gerente' ? store.branches : store.branches.filter((branch) => branch.id === user.sucursal_id),
    user: publicUser(user),
    productKeyHint: store.productKey,
  }
}

export function getDashboard(branchId, userId) {
  const user = store.staff.find((person) => person.id === userId)
  const branch = store.branches.find((item) => item.id === branchId)
  if (!user) throw notFound('Usuario no encontrado.')
  if (!branch) throw notFound('Sucursal no encontrada.')
  if (user.rol !== 'gerente' && user.sucursal_id !== branchId) throw forbidden('No puede consultar otra sucursal.')
  const branchTables = store.tables.filter((table) => table.sucursal_id === branchId)
  const branchOrders = store.orders.filter((order) => order.sucursal_id === branchId)
  const activeOrders = branchOrders.filter((order) => order.estado === 'abierta')
  const openPayments = store.payments.filter((payment) => !payment.cierre_id)
  const paidOrderIds = new Set(openPayments.map((payment) => payment.orden_id))
  const income = openPayments.filter((payment) => branchOrders.some((order) => order.id === payment.orden_id)).reduce((sum, payment) => sum + payment.monto, 0)
  const rows = branchTables.map((table) => {
    const order = activeOrders.find((item) => item.mesa_id === table.id)
    const waiter = store.staff.find((person) => person.id === order?.mesero_id)
    return {
      mesa_id: table.id,
      numero_mesa: table.numero_mesa,
      capacidad: table.capacidad,
      estado: table.estado,
      clientes: table.estado === 'libre' ? null : table.capacidad,
      mesero: waiter?.nombre || null,
      hora_inicio: order?.fecha_hora_inicio || null,
      monto: order ? orderTotals(order).total : null,
      orden_id: order?.id || null,
      pagada: order ? paidOrderIds.has(order.id) : false,
    }
  })
  return {
    branch,
    kpis: {
      disponibles: branchTables.filter((table) => table.estado === 'libre').length,
      ocupadas: branchTables.filter((table) => ['ocupada', 'pagando'].includes(table.estado)).length,
      ingresos: income,
      pendientes_cocina: activeOrders.flatMap((order) => order.items).filter((item) => ['pendiente', 'preparando'].includes(item.estado)).length,
    },
    rows,
  }
}

export function getMenu(branchId, category, search) {
  return store.products.filter((product) => {
    const matchesBranch = product.sucursal_id === branchId
    const matchesCategory = !category || product.categoria === category
    const matchesSearch = !search || product.nombre.toLowerCase().includes(String(search).toLowerCase())
    return matchesBranch && matchesCategory && matchesSearch
  })
}

export function getOrderForTable(tableId) {
  const table = store.tables.find((item) => item.id === tableId)
  if (!table) throw notFound('Mesa no encontrada.')
  const order = findOpenOrderByTable(tableId)
  return { table, order: enrichOrder(order) }
}

export function createOrder({ branchId, tableId, userId }) {
  const user = store.staff.find((person) => person.id === userId)
  const table = store.tables.find((item) => item.id === tableId && item.sucursal_id === branchId)
  if (!user) throw notFound('Usuario no encontrado.')
  if (!table) throw notFound('Mesa no encontrada.')
  if (!['gerente', 'mesero'].includes(user.rol)) throw forbidden('El usuario no puede crear ordenes.')
  if (user.rol !== 'gerente' && user.sucursal_id !== branchId) throw forbidden('El mesero solo puede operar su sucursal.')
  if (findOpenOrderByTable(tableId)) throw badRequest('La mesa ya tiene una orden abierta.')
  const order = {
    id: store.createId('ord'),
    sucursal_id: branchId,
    mesa_id: tableId,
    mesero_id: user.id,
    fecha_hora_inicio: store.now(),
    fecha_hora_cierre: null,
    estado: 'abierta',
    observaciones: '',
    cliente: '',
    items: [],
  }
  store.orders.push(order)
  table.estado = 'ocupada'
  return enrichOrder(order)
}

export function addOrderItem(orderId, { productId, cantidad = 1, observaciones = '' }) {
  const order = requireOpenOrder(orderId)
  const product = store.products.find((item) => item.id === productId && item.sucursal_id === order.sucursal_id)
  if (!product) throw notFound('Producto no encontrado.')
  if (!product.disponible) throw badRequest('El producto no esta disponible.')
  const qty = Number(cantidad)
  if (!Number.isInteger(qty) || qty < 1) throw badRequest('La cantidad debe ser mayor a cero.')
  const existing = order.items.find((item) => item.plato_id === productId && item.estado !== 'cancelado')
  if (existing) {
    existing.cantidad += qty
  } else {
    order.items.push({
      id: store.createId('item'),
      orden_id: order.id,
      plato_id: productId,
      cantidad: qty,
      precio_unitario: product.precio,
      observaciones,
      estado: 'pendiente',
      fecha_creacion: store.now(),
    })
  }
  return enrichOrder(order)
}

export function removeOrderItem(orderId, itemId) {
  const order = requireOpenOrder(orderId)
  const item = order.items.find((entry) => entry.id === itemId)
  if (!item) throw notFound('Item no encontrado.')
  order.items = order.items.filter((entry) => entry.id !== itemId)
  return enrichOrder(order)
}

export function updateOrder(orderId, { observaciones, cliente }) {
  const order = requireOpenOrder(orderId)
  if (observaciones !== undefined) order.observaciones = String(observaciones)
  if (cliente !== undefined) order.cliente = String(cliente)
  return enrichOrder(order)
}

export function sendKitchen(orderId) {
  const order = requireOpenOrder(orderId)
  if (order.items.length === 0) throw badRequest('No puede enviar una comanda vacia.')
  order.items = order.items.map((item) => ({ ...item, estado: ['servido', 'cancelado'].includes(item.estado) ? item.estado : 'pendiente' }))
  const table = store.tables.find((item) => item.id === order.mesa_id)
  if (table) table.estado = 'ocupada'
  return enrichOrder(order)
}

export function cancelOrder(orderId, userId) {
  const user = store.staff.find((person) => person.id === userId)
  const order = requireOpenOrder(orderId)
  const table = store.tables.find((item) => item.id === order.mesa_id)
  if (!user) throw notFound('Usuario no encontrado.')
  order.estado = 'cancelada'
  order.fecha_hora_cierre = store.now()
  if (table) table.estado = 'libre'
  return enrichOrder(order)
}

export function getKitchen(branchId, userId) {
  const user = store.staff.find((person) => person.id === userId)
  if (!user) throw notFound('Usuario no encontrado.')
  if (user.rol !== 'cocinero') throw forbidden('Solo cocina puede consultar este tablero.')
  if (user.sucursal_id !== branchId) throw forbidden('El cocinero solo puede ver su sucursal.')
  const orders = store.orders
    .filter((order) => order.sucursal_id === branchId && order.estado === 'abierta' && order.items.some((item) => ['pendiente', 'preparando', 'listo'].includes(item.estado)))
    .map(enrichOrder)
  return { orders }
}

export function advanceKitchen(orderId, targetStatus) {
  const order = requireOpenOrder(orderId)
  const nextStatus = ['pendiente', 'preparando', 'listo', 'servido'].includes(targetStatus) ? targetStatus : null
  if (!nextStatus) throw badRequest('Estado de cocina invalido.')
  order.items = order.items.map((item) => ['cancelado'].includes(item.estado) ? item : { ...item, estado: nextStatus })
  return enrichOrder(order)
}

export function addPayment({ orderId, metodo_pago, monto, referencia }) {
  const order = requireOpenOrder(orderId)
  const allowed = ['efectivo', 'tarjeta', 'transferencia', 'cheque']
  if (!allowed.includes(metodo_pago)) throw badRequest('Metodo de pago invalido.')
  const expected = orderTotals(order).total
  const amount = monto === undefined ? expected : Number(monto)
  if (!Number.isFinite(amount) || amount <= 0) throw badRequest('Monto de pago invalido.')
  const payment = {
    id: store.createId('pago'),
    orden_id: order.id,
    monto: amount,
    metodo_pago,
    fecha_pago: store.now(),
    referencia: referencia || null,
    cierre_id: null,
  }
  store.payments.push(payment)
  order.estado = 'pagada'
  order.fecha_hora_cierre = store.now()
  const table = store.tables.find((item) => item.id === order.mesa_id)
  if (table) table.estado = 'libre'
  return { payment, order: enrichOrder(order) }
}

export function getReports(branchId, userId) {
  const user = store.staff.find((person) => person.id === userId)
  if (!user) throw notFound('Usuario no encontrado.')
  if (user.rol !== 'gerente') throw forbidden('Solo el gerente puede consultar reportes.')
  return getCurrentReport(branchId)
}

export function closeCashRegister({ branchId, userId }) {
  const user = store.staff.find((person) => person.id === userId)
  const branch = store.branches.find((item) => item.id === branchId)
  if (!user) throw notFound('Usuario no encontrado.')
  if (!branch) throw notFound('Sucursal no encontrada.')
  if (user.rol !== 'gerente') throw forbidden('Solo el gerente puede cerrar caja.')
  const activeOrders = store.orders.filter((order) => order.sucursal_id === branchId && order.estado === 'abierta')
  if (activeOrders.length > 0) throw badRequest('No puede cerrar caja con ordenes abiertas.')
  const report = getCurrentReport(branchId)
  if (report.transacciones === 0) throw badRequest('No hay transacciones pendientes para cerrar.')
  const cierre = {
    id: store.createId('cierre'),
    sucursal_id: branchId,
    responsable_id: userId,
    fecha: new Date().toISOString().slice(0, 10),
    fecha_hora: store.now(),
    total_ventas: report.total_ventas,
    transacciones: report.transacciones,
    metodos: report.metodos,
    top_platos: report.top_platos,
    tipo_cambio: report.tipo_cambio,
  }
  store.cashClosings.push(cierre)
  const branchOrderIds = new Set(store.orders.filter((order) => order.sucursal_id === branchId).map((order) => order.id))
  store.payments.forEach((payment) => {
    if (!payment.cierre_id && branchOrderIds.has(payment.orden_id)) payment.cierre_id = cierre.id
  })
  return { cierre, report: getCurrentReport(branchId) }
}

function getCurrentReport(branchId) {
  const branchOrders = store.orders.filter((order) => order.sucursal_id === branchId)
  const branchOrderIds = new Set(branchOrders.map((order) => order.id))
  const branchPayments = store.payments.filter((payment) => branchOrderIds.has(payment.orden_id) && !payment.cierre_id)
  const branchPaidOrderIds = new Set(branchPayments.map((payment) => payment.orden_id))
  const metodos = branchPayments.reduce((acc, payment) => {
    acc[payment.metodo_pago] = (acc[payment.metodo_pago] || 0) + payment.monto
    return acc
  }, {})
  const products = {}
  branchOrders.filter((order) => branchPaidOrderIds.has(order.id)).forEach((order) => {
    order.items.forEach((item) => {
      const product = store.products.find((entry) => entry.id === item.plato_id)
      if (!product) return
      products[product.id] = products[product.id] || { nombre: product.nombre, cantidad: 0, ingresos: 0 }
      products[product.id].cantidad += item.cantidad
      products[product.id].ingresos += item.cantidad * item.precio_unitario
    })
  })
  return {
    total_ventas: branchPayments.reduce((sum, payment) => sum + payment.monto, 0),
    transacciones: branchPayments.length,
    metodos,
    top_platos: Object.values(products).sort((a, b) => b.ingresos - a.ingresos).slice(0, 5),
    cierres: store.cashClosings.filter((closing) => closing.sucursal_id === branchId).slice(-5).reverse(),
    tipo_cambio: [
      { moneda: 'USD', valor: 945 },
      { moneda: 'EUR', valor: 1028 },
      { moneda: 'BRL', valor: 174 },
    ],
  }
}

function requireOpenOrder(orderId) {
  const order = store.orders.find((item) => item.id === orderId)
  if (!order) throw notFound('Orden no encontrada.')
  if (order.estado !== 'abierta') throw badRequest('La orden no esta abierta.')
  return order
}

function enrichOrder(order) {
  if (!order) return null
  const table = store.tables.find((item) => item.id === order.mesa_id)
  const waiter = store.staff.find((item) => item.id === order.mesero_id)
  const items = order.items.map((item) => {
    const product = store.products.find((entry) => entry.id === item.plato_id)
    return { ...item, producto: product ? { id: product.id, nombre: product.nombre, categoria: product.categoria, precio: product.precio } : null }
  })
  return { ...order, table, mesero: waiter ? publicUser(waiter) : null, items, totals: orderTotals(order) }
}
