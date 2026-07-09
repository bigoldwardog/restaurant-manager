import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, query } from './api.js'
import './App.css'

const roles = [
  { value: 'gerente', label: 'Gerente' },
  { value: 'mesero', label: 'Mesero' },
  { value: 'cocinero', label: 'Cocinero' },
]

const categories = [
  { id: 'entrada', label: 'Entradas' },
  { id: 'plato_fondo', label: 'Plato de fondo' },
  { id: 'bebida', label: 'Bebidas' },
  { id: 'postre', label: 'Postre' },
  { id: 'bajativo', label: 'Bajativo' },
]

const kitchenGroups = [
  { id: 'pendiente', next: 'preparando', label: 'Pendiente', color: 'orange', action: 'Confirmar preparacion' },
  { id: 'preparando', next: 'listo', label: 'Preparando', color: 'blue', action: 'Marcar listo' },
  { id: 'listo', next: 'servido', label: 'Listo', color: 'green', action: 'Despachar' },
]

function formatCurrency(value) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value || 0)
}

function formatTime(dateString) {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

function statusLabel(status) {
  const labels = { libre: 'Libre', ocupada: 'Ocupado', pagando: 'Pagando' }
  return labels[status] || status || 'N/A'
}

function dominantStatus(order) {
  if (order.items.some((item) => item.estado === 'pendiente')) return 'pendiente'
  if (order.items.some((item) => item.estado === 'preparando')) return 'preparando'
  if (order.items.some((item) => item.estado === 'listo')) return 'listo'
  return 'servido'
}

function TopBar({ user, branch, onLogout, onCashClose }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-icon">RM</span>
        <span>RestaurantManager</span>
      </div>
      <div className="topbar-center">
        {user?.rol === 'gerente' && branch && <button className="cash-close-button" onClick={onCashClose}>Cerrar caja</button>}
      </div>
      <div className="topbar-actions">
        {user && <button className="ghost-button" onClick={onLogout}>Cerrar sesion</button>}
      </div>
    </header>
  )
}

function Login({ onLogin }) {
  const [mode, setMode] = useState('login')
  const [role, setRole] = useState('gerente')
  const [rut, setRut] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [productKey, setProductKey] = useState('')
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      if (mode === 'recover') {
        const result = await api('/api/auth/recover', { method: 'POST', body: JSON.stringify({ rut }) })
        setMessage(result.message)
      } else if (mode === 'register') {
        const result = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ rut, clave: password, confirmacion: confirmPassword, nombre: name, rol: role, productKey }) })
        onLogin(result.user)
      } else {
        const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ rut, clave: password, rol: role }) })
        onLogin(result.user)
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-hero">
        <h1>Restaurant Manager</h1>
        <div className="burger-mark"><span /><span /><span /><span /></div>
      </section>
      <section className="login-card">
        <h2>{mode === 'login' ? 'Ingrese sus credenciales' : mode === 'register' ? 'Registrar usuario' : 'Recuperar contraseña'}</h2>
        <form onSubmit={submit}>
          {mode === 'register' && (
            <label>
              Nombre
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre completo" />
            </label>
          )}
          {mode !== 'recover' && (
            <label>
              Cargo
              <select value={role} onChange={(event) => setRole(event.target.value)}>
                {roles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          )}
          <label>
            RUT
            <input value={rut} onChange={(event) => setRut(event.target.value)} placeholder="Formato requerido: 12345678-9" />
          </label>
          {mode !== 'recover' && (
            <label>
              Clave
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="**********" />
            </label>
          )}
          {mode === 'register' && (
            <>
              <label>
                Confirmar clave
                <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </label>
              <label>
                Key de producto
                <input value={productKey} onChange={(event) => setProductKey(event.target.value)} placeholder="RM-2026-DEMO" />
              </label>
            </>
          )}
          {message && <p className="form-message">{message}</p>}
          <button className="primary-button" type="submit" disabled={busy}>{mode === 'login' ? 'Iniciar sesion' : mode === 'register' ? 'Registrarse' : 'Solicitar ayuda'}</button>
        </form>
        <div className="demo-users">
          <strong>Credenciales demo</strong>
          <span>Gerente: 11111111-1 / admin123</span>
          <span>Mesero: 22222222-2 / mesero123</span>
          <span>Cocinero: 33333333-3 / cocina123</span>
        </div>
        <div className="login-actions">
          <button onClick={() => setMode(mode === 'login' ? 'recover' : 'login')}>{mode === 'recover' ? 'Volver al login' : 'Olvide mi contraseña'}</button>
          <button onClick={() => setMode(mode === 'register' ? 'login' : 'register')}>{mode === 'register' ? 'Ya tengo cuenta' : 'Registrarse'}</button>
        </div>
      </section>
    </main>
  )
}

function AppHeader({ user, branch, branches, setBranchId }) {
  return (
    <section className="app-header">
      {user.rol !== 'cocinero' && (
        <div className="branch-control">
          <strong>Sucursal actual:</strong>
          {user.rol === 'gerente' ? (
            <select value={branch?.id || ''} onChange={(event) => setBranchId(event.target.value)}>
              {branches.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
            </select>
          ) : (
            <input value={branch?.nombre || ''} disabled />
          )}
        </div>
      )}
      {user.rol !== 'cocinero' && <strong>Usuario: {user.nombre}</strong>}
      <div className="header-date">
        <strong>{new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong>
        <span>{new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </section>
  )
}

function Navigation({ view, setView, user }) {
  if (!user || user.rol === 'cocinero') return null
  return (
    <nav className="nav-tabs">
      <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>Dashboard</button>
      <button className={view === 'order' ? 'active' : ''} onClick={() => setView('order')}>Orden</button>
      {user.rol === 'gerente' && <button className={view === 'reports' ? 'active' : ''} onClick={() => setView('reports')}>Caja y reportes</button>}
    </nav>
  )
}

function Dashboard({ user, branch, branches, setBranchId, dashboard, refreshDashboard, setView, setSelectedTableId, setNotice }) {
  const [activeTableId, setActiveTableId] = useState('')
  const rows = useMemo(() => dashboard?.rows || [], [dashboard])
  const activeRow = rows.find((row) => row.mesa_id === activeTableId) || rows[0]

  useEffect(() => {
    if (!activeTableId && rows[0]) setActiveTableId(rows[0].mesa_id)
  }, [activeTableId, rows])

  const createOrder = async () => {
    const freeTable = rows.find((row) => row.estado === 'libre')
    if (!freeTable) {
      setNotice('No hay mesas libres en esta sucursal.')
      return
    }
    try {
      const order = await api('/api/orders', { method: 'POST', body: JSON.stringify({ branchId: branch.id, tableId: freeTable.mesa_id, userId: user.id }) })
      setSelectedTableId(order.mesa_id)
      await refreshDashboard()
      setView('order')
    } catch (error) {
      setNotice(error.message)
    }
  }

  const editOrder = async () => {
    if (!activeRow) return
    setSelectedTableId(activeRow.mesa_id)
    setView('order')
  }

  const charge = () => {
    if (!activeRow || activeRow.estado === 'libre') return
    setSelectedTableId(activeRow.mesa_id)
    setView('reports')
  }

  return (
    <>
      <AppHeader user={user} branch={branch} branches={branches} setBranchId={setBranchId} />
      <main className="dashboard">
        <section className="kpi-row">
          <article className="kpi-card">
            <span>Mesas:</span>
            <strong>{dashboard?.kpis.disponibles || 0} Disponibles</strong>
            <i className="dot green" />
            <strong>{dashboard?.kpis.ocupadas || 0} Ocupadas</strong>
            <i className="dot red" />
          </article>
          {user.rol === 'gerente' && (
            <article className="kpi-card">
              <span>Ingresos:</span>
              <strong>{formatCurrency(dashboard?.kpis.ingresos)}</strong>
              <small>Hoy</small>
            </article>
          )}
          <article className="kpi-card">
            <span>Ordenes pendientes:</span>
            <strong>{dashboard?.kpis.pendientes_cocina || 0} en cocina</strong>
            <i className="dot yellow" />
          </article>
          <button className="large-action" onClick={createOrder}>Crear nueva orden</button>
        </section>
        <section className="dashboard-grid">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mesa</th>
                  <th>N° Clientes</th>
                  <th>Mesero</th>
                  <th>Hora de inicio</th>
                  <th>Monto</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.mesa_id} className={activeTableId === row.mesa_id ? 'selected-row' : ''} onClick={() => setActiveTableId(row.mesa_id)}>
                    <td>{row.numero_mesa}</td>
                    <td>{row.clientes || 'N/A'}</td>
                    <td>{row.mesero || 'N/A'}</td>
                    <td>{formatTime(row.hora_inicio)}</td>
                    <td>{row.monto ? formatCurrency(row.monto) : 'N/A'}</td>
                    <td><span>{statusLabel(row.estado)}</span><i className={`dot ${row.estado}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <aside className="selected-panel">
            <h3>Mesa seleccionada:</h3>
            <strong>{activeRow ? `Mesa ${activeRow.numero_mesa}` : 'N/A'}</strong>
            <button onClick={editOrder} disabled={!activeRow}>Editar orden</button>
            <button onClick={charge} disabled={!activeRow || activeRow.estado === 'libre'}>Cobrar</button>
          </aside>
        </section>
      </main>
    </>
  )
}

function OrderManagement({ user, branch, branches, tableRows, selectedTableId, setSelectedTableId, refreshDashboard, setView, setNotice }) {
  const [category, setCategory] = useState('plato_fondo')
  const [search, setSearch] = useState('')
  const [menu, setMenu] = useState([])
  const [context, setContext] = useState(null)
  const [note, setNote] = useState('')
  const [client, setClient] = useState('')
  const order = context?.order
  const table = context?.table

  const loadContext = useCallback(async () => {
    if (!selectedTableId) return
    const result = await api(`/api/orders/table/${selectedTableId}`)
    setContext(result)
    setNote(result.order?.observaciones || '')
    setClient(result.order?.cliente || '')
  }, [selectedTableId])

  const loadMenu = useCallback(async () => {
    if (!branch?.id) return
    const result = await api(`/api/menu?${query({ branchId: branch.id, category, search })}`)
    setMenu(result)
  }, [branch?.id, category, search])

  useEffect(() => {
    loadContext().catch((error) => setNotice(error.message))
  }, [loadContext, setNotice])

  useEffect(() => {
    loadMenu().catch((error) => setNotice(error.message))
  }, [loadMenu, setNotice])

  const ensureOrder = async () => {
    if (order) return order
    const created = await api('/api/orders', { method: 'POST', body: JSON.stringify({ branchId: branch.id, tableId: table.id, userId: user.id }) })
    await loadContext()
    await refreshDashboard()
    return created
  }

  const addProduct = async (product) => {
    try {
      const current = await ensureOrder()
      await api(`/api/orders/${current.id}/items`, { method: 'POST', body: JSON.stringify({ productId: product.id, cantidad: 1 }) })
      await loadContext()
      await refreshDashboard()
    } catch (error) {
      setNotice(error.message)
    }
  }

  const removeItem = async (itemId) => {
    if (!order) return
    try {
      await api(`/api/orders/${order.id}/items/${itemId}`, { method: 'DELETE' })
      await loadContext()
      await refreshDashboard()
    } catch (error) {
      setNotice(error.message)
    }
  }

  const saveOrder = async () => {
    if (!order) return
    try {
      await api(`/api/orders/${order.id}`, { method: 'PATCH', body: JSON.stringify({ observaciones: note, cliente: client }) })
      await loadContext()
      setNotice('Orden actualizada.')
    } catch (error) {
      setNotice(error.message)
    }
  }

  const sendKitchen = async () => {
    if (!order) {
      setNotice('No hay orden creada para enviar.')
      return
    }
    try {
      await saveOrder()
      await api(`/api/orders/${order.id}/send-kitchen`, { method: 'POST' })
      await refreshDashboard()
      setView('dashboard')
    } catch (error) {
      setNotice(error.message)
    }
  }

  const cancelOrder = async () => {
    if (!order) {
      setView('dashboard')
      return
    }
    try {
      await api(`/api/orders/${order.id}/cancel`, { method: 'POST', body: JSON.stringify({ userId: user.id }) })
      await refreshDashboard()
      setView('dashboard')
    } catch (error) {
      setNotice(error.message)
    }
  }

  return (
    <>
      <AppHeader user={user} branch={branch} branches={branches} setBranchId={() => {}} />
      <main className="order-page">
        <section className="order-toolbar">
          <strong>Mesa actual:</strong>
          <select value={selectedTableId || ''} onChange={(event) => setSelectedTableId(event.target.value)}>
            {(tableRows.length ? tableRows : [{ mesa_id: selectedTableId, numero_mesa: table?.numero_mesa || '' }]).map((item) => <option key={item.mesa_id} value={item.mesa_id}>Mesa {item.numero_mesa}</option>)}
          </select>
          <strong>Estado: {statusLabel(table?.estado)}</strong>
          <i className={`dot ${table?.estado}`} />
        </section>
        <section className="order-board">
          <div className="order-column">
            <h2>Categorias</h2>
            <div className="category-list">
              {categories.map((item) => <button key={item.id} className={category === item.id ? 'active' : ''} onClick={() => setCategory(item.id)}>{item.label}</button>)}
            </div>
          </div>
          <div className="order-column">
            <h2>Productos</h2>
            <div className="search-box">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar producto" />
            </div>
            <div className="product-list">
              {menu.map((product) => (
                <button key={product.id} disabled={!product.disponible} onClick={() => addProduct(product)}>
                  <span>{product.nombre}</span>
                  <strong>{formatCurrency(product.precio)}</strong>
                  {!product.disponible && <em>No disponible</em>}
                </button>
              ))}
            </div>
          </div>
          <div className="order-column summary-column">
            <h2>Orden actual</h2>
            <label className="client-field">
              Cliente
              <input value={client} onChange={(event) => setClient(event.target.value)} placeholder="Opcional" />
            </label>
            <div className="current-order">
              {(order?.items || []).map((item) => (
                <div key={item.id} className="order-line">
                  <span>{item.producto?.nombre || 'Producto'} x{item.cantidad}</span>
                  <strong>{formatCurrency(item.precio_unitario * item.cantidad)}</strong>
                  <button onClick={() => removeItem(item.id)}>Quitar</button>
                </div>
              ))}
              {!order?.items?.length && <p className="empty-state">Agregue productos para iniciar la orden.</p>}
            </div>
            <div className="totals">
              <span>Subtotal:</span><strong>{formatCurrency(order?.totals.subtotal)}</strong>
              <span>IVA:</span><strong>{formatCurrency(order?.totals.iva)}</strong>
              <span>Total:</span><strong>{formatCurrency(order?.totals.total)}</strong>
            </div>
            <label className="notes">
              Observaciones
              <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Notas especiales" />
            </label>
            <button className="small-action" onClick={saveOrder} disabled={!order}>Guardar observaciones</button>
          </div>
        </section>
        <section className="bottom-actions">
          <button className="cancel-button" onClick={cancelOrder}>Cancelar</button>
          <button className="primary-button" onClick={sendKitchen}>Enviar comanda</button>
          <button className="pay-button" onClick={() => setView('reports')} disabled={!order}>Agregar pago</button>
        </section>
      </main>
    </>
  )
}

function Kitchen({ user, branch, setNotice }) {
  const [orders, setOrders] = useState([])

  const loadKitchen = useCallback(async () => {
    if (!branch?.id) return
    const result = await api(`/api/kitchen?${query({ branchId: branch.id, userId: user.id })}`)
    setOrders(result.orders)
  }, [branch?.id, user.id])

  useEffect(() => {
    loadKitchen().catch((error) => setNotice(error.message))
  }, [loadKitchen, setNotice])

  const moveOrder = async (orderId, estado) => {
    try {
      await api(`/api/kitchen/orders/${orderId}`, { method: 'PATCH', body: JSON.stringify({ estado }) })
      await loadKitchen()
    } catch (error) {
      setNotice(error.message)
    }
  }

  return (
    <>
      <section className="kitchen-header">
        <strong>{new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong>
        <span>{new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
      </section>
      <main className="kanban">
        {kitchenGroups.map((group) => {
          const items = orders.filter((order) => dominantStatus(order) === group.id)
          return (
            <section key={group.id} className="kanban-column">
              <h2 className={group.color}>{group.label} ({items.length})</h2>
              {items.map((order) => (
                <article key={order.id} className="kitchen-card">
                  <div className={`time-band ${group.color}`}>{formatTime(order.fecha_hora_inicio)}</div>
                  <h3>Mesa {order.table?.numero_mesa}</h3>
                  <ul>
                    {order.items.map((item) => <li key={item.id}>{item.producto?.nombre} x{item.cantidad}</li>)}
                  </ul>
                  <strong>Observaciones:</strong>
                  <p>{order.observaciones || 'Sin observaciones'}</p>
                  <button onClick={() => moveOrder(order.id, group.next)}>{group.action}</button>
                </article>
              ))}
              {!items.length && <p className="empty-column">Sin comandas</p>}
            </section>
          )
        })}
      </main>
    </>
  )
}

function Reports({ user, branch, selectedTableId, refreshDashboard, setView, setNotice }) {
  const [context, setContext] = useState(null)
  const [reports, setReports] = useState(null)
  const order = context?.order

  const load = useCallback(async () => {
    if (selectedTableId) setContext(await api(`/api/orders/table/${selectedTableId}`))
    if (user.rol === 'gerente') setReports(await api(`/api/reports?${query({ branchId: branch.id, userId: user.id })}`))
  }, [branch.id, selectedTableId, user.id, user.rol])

  useEffect(() => {
    load().catch((error) => setNotice(error.message))
  }, [load, setNotice])

  const addPayment = async (method) => {
    if (!order) return
    try {
      await api('/api/payments', { method: 'POST', body: JSON.stringify({ orderId: order.id, metodo_pago: method }) })
      await refreshDashboard()
      await load()
      setContext(null)
      setNotice('Pago registrado correctamente.')
    } catch (error) {
      setNotice(error.message)
    }
  }

  return (
    <>
      <AppHeader user={user} branch={branch} branches={[branch]} setBranchId={() => {}} />
      <main className="reports">
        {user.rol === 'gerente' ? (
          <section className="report-grid">
            <article className="report-card highlight"><span>Total de ventas</span><strong>{formatCurrency(reports?.total_ventas)}</strong></article>
            <article className="report-card"><span>Transacciones</span><strong>{reports?.transacciones || 0}</strong></article>
            <article className="report-card"><span>Orden seleccionada</span><strong>{order ? formatCurrency(order.totals.total) : 'Sin pago pendiente'}</strong></article>
          </section>
        ) : (
          <section className="report-grid single">
            <article className="report-card highlight"><span>Orden seleccionada</span><strong>{order ? formatCurrency(order.totals.total) : 'Sin pago pendiente'}</strong></article>
          </section>
        )}
        <section className="payment-panel">
          <h2>Agregar pago</h2>
          <div>
            <button onClick={() => addPayment('efectivo')} disabled={!order}>Efectivo</button>
            <button onClick={() => addPayment('tarjeta')} disabled={!order}>Tarjeta</button>
            <button onClick={() => addPayment('transferencia')} disabled={!order}>Transferencia</button>
          </div>
        </section>
        {user.rol === 'gerente' && (
          <section className="report-columns">
            <article>
              <h2>Metodos de pago</h2>
              {['efectivo', 'tarjeta', 'transferencia', 'cheque'].map((method) => <p key={method}><span>{method}</span><strong>{formatCurrency(reports?.metodos?.[method])}</strong></p>)}
            </article>
            <article>
              <h2>Top platos vendidos</h2>
              {(reports?.top_platos || []).map((product) => <p key={product.nombre}><span>{product.nombre} ({product.cantidad})</span><strong>{formatCurrency(product.ingresos)}</strong></p>)}
              {!reports?.top_platos?.length && <p><span>Sin ventas registradas</span><strong>{formatCurrency(0)}</strong></p>}
            </article>
            <article>
              <h2>Tipo de cambio</h2>
              {(reports?.tipo_cambio || []).map((rate) => <p key={rate.moneda}><span>{rate.moneda}</span><strong>{formatCurrency(rate.valor)}</strong></p>)}
            </article>
          </section>
        )}
        <button className="primary-button" onClick={() => setView('dashboard')}>Volver al dashboard</button>
      </main>
    </>
  )
}

export default function App() {
  const [user, setUser] = useState(null)
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState('')
  const [view, setView] = useState('dashboard')
  const [dashboard, setDashboard] = useState(null)
  const [selectedTableId, setSelectedTableId] = useState('')
  const [notice, setNotice] = useState('')
  const branch = branches.find((item) => item.id === branchId) || branches[0]

  const refreshDashboard = useCallback(async () => {
    if (!user || !branch?.id || user.rol === 'cocinero') return
    const result = await api(`/api/dashboard?${query({ branchId: branch.id, userId: user.id })}`)
    setDashboard(result)
    if (!selectedTableId && result.rows[0]) setSelectedTableId(result.rows[0].mesa_id)
  }, [branch?.id, selectedTableId, user])

  useEffect(() => {
    refreshDashboard().catch((error) => setNotice(error.message))
  }, [refreshDashboard])

  const loginUser = async (session) => {
    const bootstrap = await api(`/api/bootstrap?${query({ userId: session.id })}`)
    setBranches(bootstrap.branches)
    setBranchId(session.rol === 'gerente' ? bootstrap.branches[0]?.id : session.sucursal_id)
    setView(session.rol === 'cocinero' ? 'kitchen' : 'dashboard')
    setUser(session)
    setNotice('')
  }

  const logout = () => {
    setUser(null)
    setBranches([])
    setBranchId('')
    setDashboard(null)
    setSelectedTableId('')
    setView('dashboard')
  }

  const closeCash = async () => {
    if (!user || !branch) return
    const confirmed = window.confirm(`Confirmar cierre de caja para ${branch.nombre}. Se guardara el reporte actual y las ventas volveran a cero para esta sucursal.`)
    if (!confirmed) return
    try {
      const result = await api('/api/cash-close', { method: 'POST', body: JSON.stringify({ branchId: branch.id, userId: user.id }) })
      await refreshDashboard()
      setNotice(`Caja cerrada. Total guardado: ${formatCurrency(result.cierre.total_ventas)}.`)
    } catch (error) {
      setNotice(error.message)
    }
  }

  return (
    <div className="app-shell">
      <TopBar user={user} branch={branch} onLogout={logout} onCashClose={closeCash} />
      {notice && <button className="notice" onClick={() => setNotice('')}>{notice}</button>}
      {!user ? (
        <Login onLogin={loginUser} />
      ) : (
        <>
          <Navigation view={view} setView={setView} user={user} />
          {view === 'dashboard' && <Dashboard user={user} branch={branch} branches={branches} setBranchId={setBranchId} dashboard={dashboard} refreshDashboard={refreshDashboard} setView={setView} setSelectedTableId={setSelectedTableId} setNotice={setNotice} />}
          {view === 'order' && <OrderManagement user={user} branch={branch} branches={branches} tableRows={dashboard?.rows || []} selectedTableId={selectedTableId} setSelectedTableId={setSelectedTableId} refreshDashboard={refreshDashboard} setView={setView} setNotice={setNotice} />}
          {view === 'kitchen' && <Kitchen user={user} branch={branch} setNotice={setNotice} />}
          {view === 'reports' && <Reports user={user} branch={branch} selectedTableId={selectedTableId} refreshDashboard={refreshDashboard} setView={setView} setNotice={setNotice} />}
        </>
      )}
    </div>
  )
}
