-- Run only after the operator has signed up and confirmed the email address.
-- Replace the placeholder locally; never paste credentials or secret keys here.
update public.profiles
set role = 'admin', status = 'active', approved_at = now(), updated_at = now()
where email = 'operator@example.com'
  and email_confirmed_at is not null;
