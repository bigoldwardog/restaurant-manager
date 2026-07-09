const now = () => new Date().toISOString()

const createId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`

const branches = [
  { id: 'suc-1', nombre: 'RestaurantManager Central', direccion: 'Av. Principal 123', ciudad: 'Biobio', telefono: '222333444', mesas_totales: 50, estado: 'activa', fecha_creacion: '2023-01-15T00:00:00.000Z' },
  { id: 'suc-2', nombre: 'RestaurantManager Sucursal Sur', direccion: 'Calle Secundaria 456', ciudad: 'Concepcion', telefono: '222444555', mesas_totales: 30, estado: 'activa', fecha_creacion: '2024-06-20T00:00:00.000Z' },
  { id: 'suc-3', nombre: 'RestaurantManager Norte', direccion: 'Los Aromos 810', ciudad: 'Chillan', telefono: '222555666', mesas_totales: 24, estado: 'activa', fecha_creacion: '2025-02-10T00:00:00.000Z' },
]

const staff = [
  { id: 'per-1', sucursal_id: 'suc-1', nombre: 'Valentina Rojas', rol: 'gerente', rut: '11111111-1', clave: 'admin123', email: 'valentina@restaurantmanager.cl', estado: 'activo' },
  { id: 'per-2', sucursal_id: 'suc-1', nombre: 'Matias Herrera', rol: 'mesero', rut: '22222222-2', clave: 'mesero123', email: 'matias@restaurantmanager.cl', estado: 'activo' },
  { id: 'per-3', sucursal_id: 'suc-1', nombre: 'Camila Fuentes', rol: 'cocinero', rut: '33333333-3', clave: 'cocina123', email: 'camila@restaurantmanager.cl', estado: 'activo' },
  { id: 'per-4', sucursal_id: 'suc-2', nombre: 'Ignacio Mendez', rol: 'gerente', rut: '44444444-4', clave: 'admin123', email: 'ignacio@restaurantmanager.cl', estado: 'activo' },
  { id: 'per-5', sucursal_id: 'suc-2', nombre: 'Fernanda Soto', rol: 'mesero', rut: '55555555-5', clave: 'mesero123', email: 'fernanda@restaurantmanager.cl', estado: 'activo' },
  { id: 'per-6', sucursal_id: 'suc-2', nombre: 'Diego Morales', rol: 'cocinero', rut: '66666666-6', clave: 'cocina123', email: 'diego@restaurantmanager.cl', estado: 'activo' },
]

const tables = branches.flatMap((branch) => Array.from({ length: branch.mesas_totales }, (_, index) => ({
  id: `mesa-${branch.id}-${index + 1}`,
  sucursal_id: branch.id,
  numero_mesa: index + 1,
  capacidad: index % 5 === 0 ? 6 : index % 3 === 0 ? 2 : 4,
  estado: 'libre',
})))

const products = [
  { id: 'plato-1', nombre: 'Empanadas de queso', descripcion: 'Entrada caliente', categoria: 'entrada', precio: 4200, costo: 1500, disponible: true },
  { id: 'plato-2', nombre: 'Ensalada de la casa', descripcion: 'Verduras frescas', categoria: 'entrada', precio: 3900, costo: 1200, disponible: true },
  { id: 'plato-3', nombre: 'Pastas a la carbonara', descripcion: 'Pasta con salsa cremosa', categoria: 'plato_fondo', precio: 12000, costo: 4000, disponible: true },
  { id: 'plato-4', nombre: 'Pollo grillado', descripcion: 'Pollo con guarnicion', categoria: 'plato_fondo', precio: 10500, costo: 3600, disponible: true },
  { id: 'plato-5', nombre: 'Risotto de champiñones', descripcion: 'Arroz cremoso', categoria: 'plato_fondo', precio: 11800, costo: 3900, disponible: true },
  { id: 'plato-6', nombre: 'Agua mineral', descripcion: 'Botella individual', categoria: 'bebida', precio: 1800, costo: 500, disponible: true },
  { id: 'plato-7', nombre: 'Limonada', descripcion: 'Limonada natural', categoria: 'bebida', precio: 2800, costo: 900, disponible: true },
  { id: 'plato-8', nombre: 'Cafe espresso', descripcion: 'Cafe de grano', categoria: 'bebida', precio: 2200, costo: 600, disponible: true },
  { id: 'plato-9', nombre: 'Tiramisu', descripcion: 'Postre frio', categoria: 'postre', precio: 4600, costo: 1700, disponible: true },
  { id: 'plato-10', nombre: 'Helado artesanal', descripcion: 'Dos sabores', categoria: 'postre', precio: 3900, costo: 1300, disponible: true },
  { id: 'plato-11', nombre: 'Bajativo de la casa', descripcion: 'Copa pequena', categoria: 'bajativo', precio: 3500, costo: 1100, disponible: true },
]

const branchProducts = branches.flatMap((branch) => products.map((product) => ({ ...product, id: `${product.id}-${branch.id}`, sucursal_id: branch.id })))

const orders = []
const payments = []
const cashClosings = []

export const store = {
  branches,
  staff,
  tables,
  products: branchProducts,
  orders,
  payments,
  cashClosings,
  productKey: 'RM-2026-DEMO',
  createId,
  now,
}
