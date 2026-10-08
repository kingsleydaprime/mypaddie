-- Events take the same self-care flag as tasks: time with people you love
-- uses the waking day, not your work hours. New events default by kind in the
-- app (social, birthday, anniversary, wedding); any one can be changed.

alter table public.events add column is_self_care boolean not null default false;

update public.events set is_self_care = true
where kind in ('social', 'birthday', 'anniversary', 'wedding');
