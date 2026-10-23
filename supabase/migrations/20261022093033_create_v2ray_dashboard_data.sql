/*
# Create V2rayAG dashboard data

1. New Tables
- `vpn_locations`: saved connection locations with a display name, country, latency, status, and active selection.
- `vpn_subscriptions`: subscription records with provider name, plan name, renewal date, traffic usage, and enabled state.
2. Security
- Row level security is enabled on both tables.
- This first version has no sign-in screen, so anon and authenticated clients receive CRUD access to the intentionally shared dashboard data.
3. Important Notes
- The tables contain dashboard configuration and status data only; they do not establish a real VPN tunnel.
- `is_active` is maintained by the application so the dashboard can highlight the selected location.
*/

CREATE TABLE IF NOT EXISTS public.vpn_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country text NOT NULL,
  flag text NOT NULL DEFAULT 'GL',
  latency_ms integer NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'maintenance', 'offline')),
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vpn_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  plan_name text NOT NULL,
  renewal_date date NOT NULL,
  used_gb numeric(10,2) NOT NULL DEFAULT 0 CHECK (used_gb >= 0),
  limit_gb numeric(10,2) NOT NULL DEFAULT 0 CHECK (limit_gb >= 0),
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vpn_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vpn_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_vpn_locations" ON public.vpn_locations;
CREATE POLICY "public_read_vpn_locations" ON public.vpn_locations FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public_insert_vpn_locations" ON public.vpn_locations;
CREATE POLICY "public_insert_vpn_locations" ON public.vpn_locations FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "public_update_vpn_locations" ON public.vpn_locations;
CREATE POLICY "public_update_vpn_locations" ON public.vpn_locations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "public_delete_vpn_locations" ON public.vpn_locations;
CREATE POLICY "public_delete_vpn_locations" ON public.vpn_locations FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public_read_vpn_subscriptions" ON public.vpn_subscriptions;
CREATE POLICY "public_read_vpn_subscriptions" ON public.vpn_subscriptions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public_insert_vpn_subscriptions" ON public.vpn_subscriptions;
CREATE POLICY "public_insert_vpn_subscriptions" ON public.vpn_subscriptions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "public_update_vpn_subscriptions" ON public.vpn_subscriptions;
CREATE POLICY "public_update_vpn_subscriptions" ON public.vpn_subscriptions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "public_delete_vpn_subscriptions" ON public.vpn_subscriptions;
CREATE POLICY "public_delete_vpn_subscriptions" ON public.vpn_subscriptions FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS vpn_locations_active_idx ON public.vpn_locations (is_active);
CREATE INDEX IF NOT EXISTS vpn_subscriptions_renewal_idx ON public.vpn_subscriptions (renewal_date);