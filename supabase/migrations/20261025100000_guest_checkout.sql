-- Compra sem cadastro prévio: a conta nasce no checkout com o e-mail do quiz e a senha é criada depois do pagamento.
alter table public.profiles add column if not exists needs_password boolean not null default false;
