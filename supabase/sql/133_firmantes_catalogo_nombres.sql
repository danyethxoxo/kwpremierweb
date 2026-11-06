-- Mantener el catálogo de firmantes de dirección alineado con Firmas Digitales.
update public.firmas_frecuentes
set nombre = 'Gustavo Solares Campos', correo = 'kwpremier@kwmexico.mx'
where correo in ('gustavo.solares@kwmexico.mx', 'kwpremier@kwmexico.mx') and puesto = 'OP';

update public.firmas_frecuentes
set nombre = 'María Fernanda Pacheco Baños'
where correo = 'fernanda.pacheco@kwmexico.mx' and puesto = 'MCA';
