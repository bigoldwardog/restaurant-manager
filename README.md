# RestaurantManager

Aplicacion web fullstack para gestion de restaurante con frontend React y backend Python/PyMongo.

## Preparar MongoDB

Instalar dependencias Python:

```bash
pip install -r requirements.txt
```

Crear `.env` desde `.env.example`:

```env
MONGO_URI=mongodb://127.0.0.1:27017
MONGO_DB=restaurant_manager
API_HOST=127.0.0.1
API_PORT=4000
```

En `mongosh`:

```javascript
use restaurant_manager
load("C:/Users/Ronald/AppData/Local/Temp/CASO_7_RestaurantManager_mongodb_existente.js")
```

Luego preparar la base para la app:

```bash
npm run setup:mongo
```

Ese paso agrega credenciales demo, normaliza textos, agrega cocinero, elimina reservas operativas y sincroniza estados de mesas con ordenes.

## Desarrollo Fullstack

Terminal 1:

```bash
npm run dev:api
```

Terminal 2:

```bash
npm run dev
```

Frontend: http://127.0.0.1:5173

API: http://127.0.0.1:4000

## Produccion local

```bash
npm run build
npm start
```

## Credenciales demo

- Gerente: 11111111-1 / admin123
- Mesero: 22222222-2 / mesero123
- Cocinero: 33333333-3 / cocina123

## Funcionalidad

- Login, registro y recuperacion simulada con validacion de RUT.
- Dashboard por rol y sucursal.
- Creacion y edicion de ordenes.
- Menu por categoria y busqueda.
- Comandas para cocina.
- Kanban de cocina por sucursal.
- Cobros con metodos de pago.
- Reportes de caja para gerente.
- Cierre de caja con snapshot guardado en `cierre_caja`.
