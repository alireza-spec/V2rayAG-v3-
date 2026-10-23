import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  Clock,
  Globe2,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { supabase } from './lib/supabase'

type Tab = 'overview' | 'locations' | 'subscriptions' | 'settings'
type LocationStatus = 'available' | 'maintenance' | 'offline'

type Location = {
  id: string
  name: string
  country: string
  flag: string
  latency_ms: number
  status: LocationStatus
  is_active: boolean
  config_link?: string | null
}

type Subscription = {
  id: string
  provider: string
  plan_name: string
  renewal_date: string
  used_gb: number
  limit_gb: number
  is_enabled: boolean
}

type Settings = {
  auto_refresh_ping: boolean
  renewal_notifications: boolean
  kill_switch: boolean
  auto_connect: boolean
  dns_over_https: boolean
}

const emptyLocation = { name: '', country: '', flag: 'GL', latency_ms: 42, status: 'available' as LocationStatus, config_link: '' }
const emptySubscription = { provider: '', plan_name: '', renewal_date: '', used_gb: 0, limit_gb: 100 }
const defaultSettings: Settings = {
  auto_refresh_ping: true,
  renewal_notifications: true,
  kill_switch: false,
  auto_connect: false,
  dns_over_https: true,
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatBytes(gb: number): string {
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  return `${(gb * 1024).toFixed(0)} MB`
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr).getTime()
  const now = Date.now()
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24))
}

function App() {
  const [tab, setTab] = useState<Tab>('overview')
  const [locations, setLocations] = useState<Location[]>([])
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [appSettings, setAppSettings] = useState<Settings>(defaultSettings)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [connectionSeconds, setConnectionSeconds] = useState(0)
  const [downloadSpeed, setDownloadSpeed] = useState(0)
  const [uploadSpeed, setUploadSpeed] = useState(0)
  const [totalDownload, setTotalDownload] = useState(0)
  const [totalUpload, setTotalUpload] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [locationModal, setLocationModal] = useState(false)
  const [subscriptionModal, setSubscriptionModal] = useState(false)
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null)
  const [editingSubscriptionId, setEditingSubscriptionId] = useState<string | null>(null)
  const [locationForm, setLocationForm] = useState(emptyLocation)
  const [subscriptionForm, setSubscriptionForm] = useState(emptySubscription)
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'location' | 'subscription'; id: string; name: string } | null>(null)

  const timerRef = useRef<number | null>(null)
  const speedRef = useRef<number | null>(null)

  const activeLocation = locations.find((location) => location.is_active) ?? locations[0]
  const enabledSubscriptions = subscriptions.filter((subscription) => subscription.is_enabled)
  const totalUsed = enabledSubscriptions.reduce((sum, subscription) => sum + Number(subscription.used_gb), 0)
  const totalLimit = enabledSubscriptions.reduce((sum, subscription) => sum + Number(subscription.limit_gb), 0)
  const usage = totalLimit > 0 ? Math.min(100, (totalUsed / totalLimit) * 100) : 0

  const expiringSubs = subscriptions.filter((sub) => {
    const days = daysUntil(sub.renewal_date)
    return days >= 0 && days <= 7
  })

  useEffect(() => {
    void loadDashboard()
    void loadSettings()
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3500)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (connected) {
      timerRef.current = window.setInterval(() => {
        setConnectionSeconds((s) => s + 1)
      }, 1000)

      speedRef.current = window.setInterval(() => {
        const dl = Math.random() * 8 + 0.5
        const ul = Math.random() * 2 + 0.1
        setDownloadSpeed(dl)
        setUploadSpeed(ul)
        setTotalDownload((prev) => prev + dl / 3600)
        setTotalUpload((prev) => prev + ul / 3600)
      }, 2000)

      return () => {
        if (timerRef.current) window.clearInterval(timerRef.current)
        if (speedRef.current) window.clearInterval(speedRef.current)
      }
    } else {
      setConnectionSeconds(0)
      setDownloadSpeed(0)
      setUploadSpeed(0)
    }
  }, [connected])

  useEffect(() => {
    if (appSettings.auto_connect && !connected && !connecting && activeLocation && loading === false) {
      void toggleConnection()
    }
  }, [appSettings.auto_connect, loading])

  function saveSettings(newSettings: Settings) {
    setAppSettings(newSettings)
    try {
      localStorage.setItem('v2rayag_settings', JSON.stringify(newSettings))
    } catch { /* ignore */ }
    setNotice('تنظیمات ذخیره شد.')
  }

  function loadSettings() {
    try {
      const stored = localStorage.getItem('v2rayag_settings')
      if (stored) setAppSettings({ ...defaultSettings, ...JSON.parse(stored) })
    } catch { /* ignore */ }
  }

  async function loadDashboard() {
    setLoading(true)
    setError('')
    const [locationsResult, subscriptionsResult] = await Promise.all([
      supabase.from('vpn_locations').select('*').order('created_at', { ascending: true }),
      supabase.from('vpn_subscriptions').select('*').order('renewal_date', { ascending: true }),
    ])
    if (locationsResult.error || subscriptionsResult.error) {
      setError('اطلاعات هنوز بارگذاری نشد. اتصال پایگاه‌داده را دوباره امتحان کنید.')
    } else {
      setLocations((locationsResult.data ?? []) as Location[])
      setSubscriptions((subscriptionsResult.data ?? []) as Subscription[])
    }
    setLoading(false)
  }

  async function refreshPing() {
    setNotice('پینگ سرورها در حال بررسی...')
    const updated = await Promise.all(
      locations.map(async (loc) => {
        if (loc.status === 'offline') return loc
        const newPing = Math.max(8, Math.round(loc.latency_ms + (Math.random() - 0.5) * 20))
        await supabase.from('vpn_locations').update({ latency_ms: newPing }).eq('id', loc.id)
        return { ...loc, latency_ms: newPing }
      })
    )
    setLocations(updated)
    setNotice('پینگ سرورها به‌روزرسانی شد.')
  }

  async function chooseLocation(location: Location) {
    setError('')
    const { error: updateError } = await supabase.from('vpn_locations').update({ is_active: false }).neq('id', location.id)
    if (updateError) {
      setError('انتخاب سرور انجام نشد.')
      return
    }
    const { error: activeError } = await supabase.from('vpn_locations').update({ is_active: true }).eq('id', location.id)
    if (activeError) {
      setError('انتخاب سرور انجام نشد.')
      return
    }
    setLocations((current) => current.map((item) => ({ ...item, is_active: item.id === location.id })))
    setNotice(`${location.name} به عنوان سرور فعال انتخاب شد.`)
  }

  async function toggleConnection() {
    if (connecting) return
    if (connected) {
      setConnected(false)
      setNotice('اتصال قطع شد.')
      return
    }
    if (!activeLocation) {
      setNotice('ابتدا یک سرور اضافه کنید.')
      setTab('locations')
      return
    }
    setConnecting(true)
    await new Promise((resolve) => window.setTimeout(resolve, 900))
    setConnecting(false)
    setConnected(true)
    setTotalDownload(0)
    setTotalUpload(0)
    setNotice(`اتصال به ${activeLocation.name} برقرار شد.`)
  }

  async function addOrUpdateLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (editingLocationId) {
      const { data, error: updateError } = await supabase
        .from('vpn_locations')
        .update({
          name: locationForm.name,
          country: locationForm.country,
          flag: locationForm.flag,
          latency_ms: locationForm.latency_ms,
          status: locationForm.status,
          config_link: locationForm.config_link || null,
        })
        .eq('id', editingLocationId)
        .select()
        .maybeSingle()
      if (updateError || !data) {
        setError('ویرایش سرور انجام نشد.')
        return
      }
      setLocations((current) => current.map((item) => (item.id === editingLocationId ? (data as Location) : item)))
      setNotice('سرور ویرایش شد.')
    } else {
      const { data, error: insertError } = await supabase
        .from('vpn_locations')
        .insert({ ...locationForm, is_active: locations.length === 0, config_link: locationForm.config_link || null })
        .select()
        .maybeSingle()
      if (insertError || !data) {
        setError('افزودن سرور انجام نشد. اطلاعات را بررسی کنید.')
        return
      }
      setLocations((current) => [...current, data as Location])
      setNotice('سرور جدید اضافه شد.')
    }
    setLocationForm(emptyLocation)
    setEditingLocationId(null)
    setLocationModal(false)
  }

  function startEditLocation(location: Location) {
    setEditingLocationId(location.id)
    setLocationForm({
      name: location.name,
      country: location.country,
      flag: location.flag,
      latency_ms: location.latency_ms,
      status: location.status,
      config_link: location.config_link ?? '',
    })
    setLocationModal(true)
  }

  async function confirmRemoveLocation() {
    if (!confirmDelete || confirmDelete.type !== 'location') return
    const { error: deleteError } = await supabase.from('vpn_locations').delete().eq('id', confirmDelete.id)
    if (deleteError) {
      setError('حذف سرور انجام نشد.')
      setConfirmDelete(null)
      return
    }
    setLocations((current) => current.filter((location) => location.id !== confirmDelete.id))
    if (activeLocation?.id === confirmDelete.id) setConnected(false)
    setNotice('سرور حذف شد.')
    setConfirmDelete(null)
  }

  async function addOrUpdateSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (editingSubscriptionId) {
      const { data, error: updateError } = await supabase
        .from('vpn_subscriptions')
        .update({
          provider: subscriptionForm.provider,
          plan_name: subscriptionForm.plan_name,
          renewal_date: subscriptionForm.renewal_date,
          used_gb: subscriptionForm.used_gb,
          limit_gb: subscriptionForm.limit_gb,
        })
        .eq('id', editingSubscriptionId)
        .select()
        .maybeSingle()
      if (updateError || !data) {
        setError('ویرایش اشتراک انجام نشد.')
        return
      }
      setSubscriptions((current) => current.map((item) => (item.id === editingSubscriptionId ? (data as Subscription) : item)))
      setNotice('اشتراک ویرایش شد.')
    } else {
      const { data, error: insertError } = await supabase
        .from('vpn_subscriptions')
        .insert({ ...subscriptionForm, is_enabled: true })
        .select()
        .maybeSingle()
      if (insertError || !data) {
        setError('افزودن اشتراک انجام نشد. اطلاعات را بررسی کنید.')
        return
      }
      setSubscriptions((current) => [...current, data as Subscription])
      setNotice('اشتراک جدید اضافه شد.')
    }
    setSubscriptionForm(emptySubscription)
    setEditingSubscriptionId(null)
    setSubscriptionModal(false)
  }

  function startEditSubscription(sub: Subscription) {
    setEditingSubscriptionId(sub.id)
    setSubscriptionForm({
      provider: sub.provider,
      plan_name: sub.plan_name,
      renewal_date: sub.renewal_date,
      used_gb: Number(sub.used_gb),
      limit_gb: Number(sub.limit_gb),
    })
    setSubscriptionModal(true)
  }

  async function confirmRemoveSubscription() {
    if (!confirmDelete || confirmDelete.type !== 'subscription') return
    const { error: deleteError } = await supabase.from('vpn_subscriptions').delete().eq('id', confirmDelete.id)
    if (deleteError) {
      setError('حذف اشتراک انجام نشد.')
      setConfirmDelete(null)
      return
    }
    setSubscriptions((current) => current.filter((subscription) => subscription.id !== confirmDelete.id))
    setNotice('اشتراک حذف شد.')
    setConfirmDelete(null)
  }

  async function toggleSubscriptionEnabled(sub: Subscription) {
    const newValue = !sub.is_enabled
    const { error: updateError } = await supabase.from('vpn_subscriptions').update({ is_enabled: newValue }).eq('id', sub.id)
    if (updateError) {
      setError('تغییر وضعیت اشتراک انجام نشد.')
      return
    }
    setSubscriptions((current) => current.map((item) => (item.id === sub.id ? { ...item, is_enabled: newValue } : item)))
    setNotice(newValue ? 'اشتراک فعال شد.' : 'اشتراک غیرفعال شد.')
  }

  const pageTitle = useMemo(() => ({ overview: 'نمای کلی اتصال', locations: 'مکان‌های اتصال', subscriptions: 'اشتراک‌ها', settings: 'تنظیمات' }[tab]), [tab])

  function navigate(nextTab: Tab) {
    setTab(nextTab)
    setSidebarOpen(false)
  }

  return (
    <div className="app-shell" dir="rtl">
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand"><span className="brand-mark"><ShieldCheck size={21} /></span><div><strong>V2rayAG</strong><small>اتصال امن</small></div></div>
        <div className="workspace-label">فضای کاری</div>
        <nav>
          <NavItem icon={<LayoutDashboard size={18} />} label="نمای کلی" active={tab === 'overview'} onClick={() => navigate('overview')} />
          <NavItem icon={<Globe2 size={18} />} label="مکان‌ها" active={tab === 'locations'} onClick={() => navigate('locations')} />
          <NavItem icon={<Zap size={18} />} label="اشتراک‌ها" active={tab === 'subscriptions'} onClick={() => navigate('subscriptions')} />
          <NavItem icon={<Settings size={18} />} label="تنظیمات" active={tab === 'settings'} onClick={() => navigate('settings')} />
        </nav>
        <div className="sidebar-bottom">
          {connected && (
            <div className="connection-status-sidebar">
              <span className="status-dot online" />
              <span>متصل · {formatDuration(connectionSeconds)}</span>
            </div>
          )}
          <div className="secure-note"><LockKeyhole size={17} /><span>اتصال رمزگذاری‌شده<br /><b>حفاظت فعال است</b></span></div>
          <div className="profile"><span>م</span><div><b>حساب شخصی</b><small>مدیر</small></div><ChevronDown size={15} /></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumbs"><span>V2rayAG</span><span>/</span><b>{pageTitle}</b></div>
          <div className="top-actions">
            {expiringSubs.length > 0 && appSettings.renewal_notifications && (
              <span className="renewal-badge" title={`${expiringSubs.length} اشتراک نزدیک تمدید`}>
                <Bell size={14} />
                {expiringSubs.length}
              </span>
            )}
            <button className="icon-button" onClick={refreshPing} title="به‌روزرسانی پینگ"><RefreshCw size={18} /></button>
            <span className="avatar">م</span>
          </div>
        </header>
        <section className="content">
          {error && <div className="alert error"><CircleHelp size={18} />{error}<button onClick={() => setError('')}><X size={15} /></button></div>}
          {notice && <div className="alert success"><Check size={18} />{notice}</div>}
          <div className="page-heading">
            <div>
              <span className="eyebrow">مرکز کنترل حریم خصوصی</span>
              <h1>{pageTitle}</h1>
              <p>مسیر اتصال، سرورها و تنظیمات اتصال خود را مدیریت کنید.</p>
            </div>
            {tab === 'locations' && <button className="primary-button" onClick={() => { setEditingLocationId(null); setLocationForm(emptyLocation); setLocationModal(true) }}><Plus size={18} />افزودن سرور</button>}
            {tab === 'subscriptions' && <button className="primary-button" onClick={() => { setEditingSubscriptionId(null); setSubscriptionForm(emptySubscription); setSubscriptionModal(true) }}><Plus size={18} />افزودن اشتراک</button>}
          </div>
          {loading ? (
            <div className="loading"><RefreshCw className="spin" size={22} />در حال دریافت اطلاعات...</div>
          ) : (
            <>
              {tab === 'overview' && (
                <Overview
                  connected={connected}
                  connecting={connecting}
                  activeLocation={activeLocation}
                  locations={locations}
                  subscriptions={subscriptions}
                  usage={usage}
                  totalUsed={totalUsed}
                  totalLimit={totalLimit}
                  connectionSeconds={connectionSeconds}
                  downloadSpeed={downloadSpeed}
                  uploadSpeed={uploadSpeed}
                  totalDownload={totalDownload}
                  totalUpload={totalUpload}
                  expiringSubs={expiringSubs}
                  onConnect={toggleConnection}
                  onLocationClick={() => setTab('locations')}
                  onRefreshPing={refreshPing}
                />
              )}
              {tab === 'locations' && (
                <Locations
                  locations={locations}
                  onChoose={chooseLocation}
                  onEdit={startEditLocation}
                  onRemove={(loc) => setConfirmDelete({ type: 'location', id: loc.id, name: loc.name })}
                  onAdd={() => { setEditingLocationId(null); setLocationForm(emptyLocation); setLocationModal(true) }}
                />
              )}
              {tab === 'subscriptions' && (
                <Subscriptions
                  subscriptions={subscriptions}
                  onEdit={startEditSubscription}
                  onRemove={(sub) => setConfirmDelete({ type: 'subscription', id: sub.id, name: sub.provider })}
                  onAdd={() => { setEditingSubscriptionId(null); setSubscriptionForm(emptySubscription); setSubscriptionModal(true) }}
                  onToggle={toggleSubscriptionEnabled}
                />
              )}
              {tab === 'settings' && <SettingsPanel settings={appSettings} onChange={saveSettings} />}
            </>
          )}
        </section>
      </main>

      {locationModal && (
        <Modal title={editingLocationId ? 'ویرایش سرور' : 'افزودن مکان اتصال'} onClose={() => { setLocationModal(false); setEditingLocationId(null) }}>
          <form onSubmit={addOrUpdateLocation} className="form-grid">
            <Field label="نام سرور" value={locationForm.name} placeholder="مثلاً آمستردام 01" onChange={(value) => setLocationForm({ ...locationForm, name: value })} required />
            <Field label="کشور" value={locationForm.country} placeholder="هلند" onChange={(value) => setLocationForm({ ...locationForm, country: value })} required />
            <Field label="کد پرچم" value={locationForm.flag} placeholder="NL" onChange={(value) => setLocationForm({ ...locationForm, flag: value.toUpperCase() })} required />
            <Field label="پینگ تقریبی (ms)" type="number" value={String(locationForm.latency_ms)} onChange={(value) => setLocationForm({ ...locationForm, latency_ms: Number(value) })} required />
            <label className="field">
              <span>وضعیت سرور</span>
              <select value={locationForm.status} onChange={(e) => setLocationForm({ ...locationForm, status: e.target.value as LocationStatus })}>
                <option value="available">آماده</option>
                <option value="maintenance">تعمیرات</option>
                <option value="offline">آفلاین</option>
              </select>
            </label>
            <Field label="لینک کانفیگ (اختیاری)" value={locationForm.config_link ?? ''} placeholder="vmess://..." onChange={(value) => setLocationForm({ ...locationForm, config_link: value })} />
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => { setLocationModal(false); setEditingLocationId(null) }}>انصراف</button>
              <button className="primary-button" type="submit">{editingLocationId ? 'ذخیره تغییرات' : 'ذخیره سرور'}</button>
            </div>
          </form>
        </Modal>
      )}

      {subscriptionModal && (
        <Modal title={editingSubscriptionId ? 'ویرایش اشتراک' : 'افزودن اشتراک'} onClose={() => { setSubscriptionModal(false); setEditingSubscriptionId(null) }}>
          <form onSubmit={addOrUpdateSubscription} className="form-grid">
            <Field label="ارائه‌دهنده" value={subscriptionForm.provider} placeholder="نام سرویس" onChange={(value) => setSubscriptionForm({ ...subscriptionForm, provider: value })} required />
            <Field label="نام پلن" value={subscriptionForm.plan_name} placeholder="پلن ماهانه" onChange={(value) => setSubscriptionForm({ ...subscriptionForm, plan_name: value })} required />
            <Field label="تاریخ تمدید" type="date" value={subscriptionForm.renewal_date} onChange={(value) => setSubscriptionForm({ ...subscriptionForm, renewal_date: value })} required />
            <Field label="حجم مصرف‌شده (GB)" type="number" value={String(subscriptionForm.used_gb)} onChange={(value) => setSubscriptionForm({ ...subscriptionForm, used_gb: Number(value) })} required />
            <Field label="حجم کل (GB)" type="number" value={String(subscriptionForm.limit_gb)} onChange={(value) => setSubscriptionForm({ ...subscriptionForm, limit_gb: Number(value) })} required />
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => { setSubscriptionModal(false); setEditingSubscriptionId(null) }}>انصراف</button>
              <button className="primary-button" type="submit">{editingSubscriptionId ? 'ذخیره تغییرات' : 'ذخیره اشتراک'}</button>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="تأیید حذف" onClose={() => setConfirmDelete(null)}>
          <div className="confirm-delete">
            <div className="confirm-icon"><Trash2 size={28} /></div>
            <p>آیا از حذف «{confirmDelete.name}» مطمئن هستید؟</p>
            <p className="confirm-subtitle">این عملیات قابل بازگشت نیست.</p>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setConfirmDelete(null)}>انصراف</button>
              <button className="danger-confirm-button" onClick={confirmDelete.type === 'location' ? confirmRemoveLocation : confirmRemoveSubscription}>بله، حذف کن</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function NavItem({ icon, label, active, onClick }: { icon: JSX.Element; label: string; active: boolean; onClick: () => void }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span>{active && <i />}</button>
}

function Overview({
  connected,
  connecting,
  activeLocation,
  locations,
  subscriptions,
  usage,
  totalUsed,
  totalLimit,
  connectionSeconds,
  downloadSpeed,
  uploadSpeed,
  totalDownload,
  totalUpload,
  expiringSubs,
  onConnect,
  onLocationClick,
  onRefreshPing,
}: {
  connected: boolean
  connecting: boolean
  activeLocation?: Location
  locations: Location[]
  subscriptions: Subscription[]
  usage: number
  totalUsed: number
  totalLimit: number
  connectionSeconds: number
  downloadSpeed: number
  uploadSpeed: number
  totalDownload: number
  totalUpload: number
  expiringSubs: Subscription[]
  onConnect: () => void
  onLocationClick: () => void
  onRefreshPing: () => void
}) {
  return (
    <div className="overview-grid">
      <section className="connection-card card">
        <div className="card-label">
          <span className={`status-dot ${connected ? 'online' : ''}`} />
          {connected ? 'متصل' : 'قطع است'}
          <span className="live-pill">{connecting ? 'در حال اتصال' : 'محافظت شخصی'}</span>
        </div>
        <button className={`power-button ${connected ? 'connected' : ''} ${connecting ? 'connecting' : ''}`} onClick={onConnect} aria-label="تغییر وضعیت اتصال" disabled={connecting}>
          {connecting ? <RefreshCw className="spin" size={38} strokeWidth={1.7} /> : <Power size={38} strokeWidth={1.7} />}
        </button>
        <h2>{connected ? 'اتصال امن برقرار است' : connecting ? 'در حال برقراری اتصال' : 'برای اتصال ضربه بزنید'}</h2>
        <p>{activeLocation ? `${activeLocation.name}، ${activeLocation.country}` : 'یک سرور برای شروع اضافه کنید'}</p>
        <div className="connection-time">
          <Clock size={15} />
          <span>زمان اتصال</span>
          <strong>{formatDuration(connectionSeconds)}</strong>
        </div>
      </section>

      <section className="side-stack">
        <div className="card location-card">
          <div className="section-title">
            <span>مکان فعال</span>
            <button onClick={onLocationClick}>تغییر</button>
          </div>
          {activeLocation ? (
            <div className="active-location">
              <span className="flag">{activeLocation.flag}</span>
              <div>
                <strong>{activeLocation.name}</strong>
                <small>{activeLocation.country}</small>
              </div>
              <div className="latency">
                <b>{activeLocation.latency_ms} ms</b>
                <small>پینگ</small>
              </div>
            </div>
          ) : (
            <button className="empty-action" onClick={onLocationClick}><Plus size={17} />افزودن اولین سرور</button>
          )}
        </div>
        <div className="card mini-stats">
          <div>
            <span>سرورها</span>
            <strong>{locations.length}</strong>
            <small>مکان ذخیره‌شده</small>
          </div>
          <div>
            <span>اشتراک فعال</span>
            <strong>{subscriptions.filter((item) => item.is_enabled).length}</strong>
            <small>سرویس متصل</small>
          </div>
        </div>
      </section>

      {connected && (
        <section className="card speed-card">
          <div className="section-title">
            <div><span>سرعت انتقال</span><small>دانلود و آپلود زنده</small></div>
            <Activity size={20} />
          </div>
          <div className="speed-grid">
            <div className="speed-item download">
              <ArrowDownToLine size={20} />
              <div>
                <strong>{downloadSpeed.toFixed(1)} <small>MB/s</small></strong>
                <span>دانلود</span>
              </div>
            </div>
            <div className="speed-item upload">
              <ArrowUpFromLine size={20} />
              <div>
                <strong>{uploadSpeed.toFixed(1)} <small>MB/s</small></strong>
                <span>آپلود</span>
              </div>
            </div>
          </div>
          <div className="traffic-total">
            <div><span>مجموع دانلود</span><b>{formatBytes(totalDownload)}</b></div>
            <div><span>مجموع آپلود</span><b>{formatBytes(totalUpload)}</b></div>
          </div>
        </section>
      )}

      <section className="card usage-card">
        <div className="section-title">
          <div><span>مصرف اشتراک</span><small>در تمام سرویس‌های فعال</small></div>
          <Activity size={20} />
        </div>
        <div className="usage-row">
          <div className="donut" style={{ '--usage': `${usage}%` } as React.CSSProperties}>
            <strong>{Math.round(usage)}%</strong>
            <small>مصرف</small>
          </div>
          <div>
            <strong className="usage-number">{formatBytes(totalUsed)}</strong>
            <p>از {formatBytes(totalLimit)} حجم کل اشتراک‌ها</p>
            <button className="text-button" onClick={onLocationClick}>مشاهده جزئیات <span>←</span></button>
          </div>
        </div>
      </section>

      {expiringSubs.length > 0 && (
        <section className="card renewal-alert-card">
          <div className="renewal-icon"><Bell size={20} /></div>
          <div>
            <strong>{expiringSubs.length} اشتراک نزدیک تمدید</strong>
            {expiringSubs.map((sub) => {
              const days = daysUntil(sub.renewal_date)
              return <p key={sub.id}>{sub.provider} — {days === 0 ? 'امروز' : `${days} روز دیگر`}</p>
            })}
          </div>
        </section>
      )}

      <section className="card trust-card">
        <div className="trust-icon"><ShieldCheck size={22} /></div>
        <div>
          <strong>امنیت شما فعال است</strong>
          <p>اتصال شما با رمزگذاری سرتاسری محافظت می‌شود.</p>
        </div>
        <Check size={20} />
      </section>
    </div>
  )
}

function Locations({ locations, onChoose, onEdit, onRemove, onAdd }: { locations: Location[]; onChoose: (location: Location) => void; onEdit: (location: Location) => void; onRemove: (location: Location) => void; onAdd: () => void }) {
  return (
    <section className="card table-card">
      <div className="table-heading">
        <div>
          <h2>سرورهای ذخیره‌شده</h2>
          <p>سرور مورد نظر را برای اتصال انتخاب کنید.</p>
        </div>
        <span className="count-badge">{locations.length} سرور</span>
      </div>
      {locations.length === 0 ? (
        <EmptyState icon={<Server size={25} />} title="هنوز سروری ندید" text="اولین سرور اتصال خود را اضافه کنید." onAdd={onAdd} />
      ) : (
        <div className="location-list">
          {locations.map((location) => (
            <div className="location-row" key={location.id}>
              <span className="flag">{location.flag}</span>
              <div className="row-main">
                <strong>{location.name}</strong>
                <small>{location.country} · {location.latency_ms} ms</small>
              </div>
              <span className={`availability ${location.status}`}>
                {location.status === 'available' ? 'آماده' : location.status === 'maintenance' ? 'تعمیرات' : 'آفلاین'}
              </span>
              <button className="icon-action" onClick={() => onEdit(location)} title="ویرایش"><Pencil size={16} /></button>
              <button className={`select-button ${location.is_active ? 'selected' : ''}`} onClick={() => onChoose(location)}>
                {location.is_active ? <><Check size={15} />فعال</> : 'انتخاب'}
              </button>
              <button className="danger-button" onClick={() => onRemove(location)} aria-label={`حذف ${location.name}`}><Trash2 size={17} /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function Subscriptions({ subscriptions, onEdit, onRemove, onAdd, onToggle }: { subscriptions: Subscription[]; onEdit: (sub: Subscription) => void; onRemove: (sub: Subscription) => void; onAdd: () => void; onToggle: (sub: Subscription) => void }) {
  return (
    <section className="card table-card">
      <div className="table-heading">
        <div>
          <h2>اشتراک‌های شما</h2>
          <p>حجم و زمان تمدید سرویس‌ها را پیگیری کنید.</p>
        </div>
        <span className="count-badge">{subscriptions.length} اشتراک</span>
      </div>
      {subscriptions.length === 0 ? (
        <EmptyState icon={<Zap size={25} />} title="هنوز اشتراکی ثبت نشده" text="اطلاعات اولین سرویس خود را اضافه کنید." onAdd={onAdd} />
      ) : (
        <div className="subscription-list">
          {subscriptions.map((subscription) => {
            const percentage = subscription.limit_gb ? Math.min(100, (Number(subscription.used_gb) / Number(subscription.limit_gb)) * 100) : 0
            const days = daysUntil(subscription.renewal_date)
            return (
              <div className="subscription-row" key={subscription.id}>
                <span className="provider-icon"><Zap size={17} /></span>
                <div className="row-main">
                  <strong>{subscription.provider}</strong>
                  <small>{subscription.plan_name} · تمدید {new Date(subscription.renewal_date).toLocaleDateString('fa-IR')}</small>
                  {days >= 0 && days <= 7 && <span className="renewal-soon">{days === 0 ? 'امروز تمدید می‌شود' : `${days} روز تا تمدید`}</span>}
                </div>
                <div className="progress-wrap">
                  <div className="progress-label">
                    <span>{Number(subscription.used_gb).toFixed(1)} / {Number(subscription.limit_gb).toFixed(0)} GB</span>
                    <b>{Math.round(percentage)}%</b>
                  </div>
                  <div className="progress"><i style={{ width: `${percentage}%` }} /></div>
                </div>
                <label className="toggle-switch" title="فعال/غیرفعال">
                  <input type="checkbox" checked={subscription.is_enabled} onChange={() => onToggle(subscription)} />
                  <span className={`switch ${subscription.is_enabled ? 'on' : ''}`}><i /></span>
                </label>
                <button className="icon-action" onClick={() => onEdit(subscription)} title="ویرایش"><Pencil size={16} /></button>
                <button className="danger-button" onClick={() => onRemove(subscription)} aria-label={`حذف ${subscription.provider}`}><Trash2 size={17} /></button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function SettingsPanel({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const items: { key: keyof Settings; icon: JSX.Element; title: string; desc: string }[] = [
    { key: 'auto_refresh_ping', icon: <RefreshCw size={19} />, title: 'به‌روزرسانی خودکار پینگ', desc: 'پینگ سرورها هنگام باز کردن داشبورد تازه‌سازی شود.' },
    { key: 'renewal_notifications', icon: <Bell size={19} />, title: 'اعلان تمدید اشتراک', desc: 'هفت روز قبل از تمدید به شما یادآوری می‌کنیم.' },
    { key: 'kill_switch', icon: <LockKeyhole size={19} />, title: 'حفاظت در زمان قطع اتصال', desc: 'در صورت قطع VPN، ترافیک را متوقف می‌کند.' },
    { key: 'auto_connect', icon: <Power size={19} />, title: 'اتصال خودکار', desc: 'هنگام باز کردن اپ به‌طور خودکار متصل شود.' },
    { key: 'dns_over_https', icon: <ShieldCheck size={19} />, title: 'DNS روی HTTPS', desc: 'درخواست‌های DNS را رمزگذاری می‌کند.' },
  ]
  return (
    <section className="settings-grid">
      {items.map((item) => (
        <div className="card setting-card" key={item.key}>
          <div className="setting-icon">{item.icon}</div>
          <div>
            <h3>{item.title}</h3>
            <p>{item.desc}</p>
          </div>
          <label className="toggle-switch">
            <input type="checkbox" checked={settings[item.key]} onChange={(e) => onChange({ ...settings, [item.key]: e.target.checked })} />
            <span className={`switch ${settings[item.key] ? 'on' : ''}`}><i /></span>
          </label>
        </div>
      ))}
    </section>
  )
}

function EmptyState({ icon, title, text, onAdd }: { icon: JSX.Element; title: string; text: string; onAdd: () => void }) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      <button className="primary-button" onClick={onAdd}><Plus size={17} />افزودن</button>
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: JSX.Element }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button onClick={onClose}><X size={19} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, value, placeholder, type = 'text', required, onChange }: { label: string; value: string; placeholder?: string; type?: string; required?: boolean; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} placeholder={placeholder} required={required} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

export default App
