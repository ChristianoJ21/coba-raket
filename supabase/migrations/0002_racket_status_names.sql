-- Racket status names from PRD ADM-1: Ready, Reserved, Out, Servicing, Retired, Sold.
-- Renames the 0001 values in place and adds `reserved` (booked, waiting for pickup).
--   available   -> ready
--   in_trial    -> out
--   maintenance -> servicing
--   sold, retired unchanged
-- Physical status only. Whether a racket is free on given DATES is still decided by the
-- booking_items exclusion constraint, never by this column.

begin;

alter table public.rackets drop constraint rackets_status_check;

update public.rackets
set status = case status
  when 'available'   then 'ready'
  when 'in_trial'    then 'out'
  when 'maintenance' then 'servicing'
  else status
end
where status in ('available', 'in_trial', 'maintenance');

alter table public.rackets alter column status set default 'ready';

alter table public.rackets add constraint rackets_status_check
  check (status in ('ready', 'reserved', 'out', 'servicing', 'retired', 'sold'));

commit;
