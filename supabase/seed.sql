-- SAMPLE stock for development and the first deploy. Not a migration: safe to re-run.
-- Specs and prices are approximate placeholders. Replace them with your real rackets
-- (weight, head size, grip, condition) before any customer sees the catalogue.
-- Costs are chosen to cover all three deposit tiers (PRD 7.2):
--   Tier 1 under Rp1.5M, Tier 2 Rp1.5M-3M, Tier 3 above Rp3M.
insert into public.rackets
  (code, brand, model, head_size_sq_in, weight_g, balance_mm, grip_size, string_pattern, level_fit, condition_grade, status, cost_idr)
values
  ('R-001', 'Wilson',  'Tour Slam Lite',      105, 265, 330, 'L2', '16x19', '{beginner}',                'good', 'available',   784000),
  ('R-002', 'Babolat', 'Boost Drive',         105, 260, 325, 'L2', '16x19', '{beginner}',                'new',  'available',  1100000),
  ('R-003', 'Head',    'Speed Lite',          100, 270, 320, 'L2', '16x19', '{beginner,intermediate}',   'good', 'available',  2200000),
  ('R-004', 'Yonex',   'Ezone 100L',          100, 285, 325, 'L2', '16x19', '{intermediate}',            'good', 'available',  2400000),
  ('R-005', 'Babolat', 'Pure Drive Team',     100, 285, 325, 'L2', '16x19', '{intermediate,advanced}',   'good', 'available',  3950000),
  ('R-006', 'Wilson',  'Clash 100',           100, 295, 320, 'L2', '16x19', '{intermediate,advanced}',   'good', 'available',  3300000),
  ('R-007', 'Head',    'Gravity Pro (bekas)', 100, 315, 315, 'L2', '16x20', '{advanced}',                'fair', 'available',  1900000)
on conflict (code) do nothing;
