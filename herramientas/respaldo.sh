#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# RESPALDO COMPLETO
# ─────────────────────────────────────────────────────────────
#
# Cómo se corre:
#
#     bash herramientas/respaldo.sh
#
# Deja todo en una carpeta ~/respaldos-kwpremier/<fecha>.
#
# ─────────────────────────────────────────────────────────────
# QUÉ SE RESPALDA Y QUÉ TAN URGENTE ES CADA COSA
# ─────────────────────────────────────────────────────────────
#
# 1. EL CÓDIGO (el repositorio).
#    Urgencia: baja. Ya vive en GitHub, en la computadora de quien
#    lo trabaja y en cada clon que se haya hecho. Que se pierda el
#    código completo es bastante difícil. Aun así se respalda,
#    porque cuesta diez segundos.
#
# 2. LA BASE DE DATOS.
#    Urgencia: ALTA. Aquí está lo que NO se puede volver a hacer:
#    los contratos, los dictámenes, los datos de los clientes, los
#    expedientes. Si el proyecto todavía está en el plan gratuito de
#    Supabase, NO HAY RESPALDO AUTOMÁTICO: un borrado por error y no
#    hay de dónde sacarlo. Esta es la parte que de verdad importa.
#
# Dicho de otra forma: el código se puede volver a escribir; un
# contrato firmado que se borró, no.
#
# ─────────────────────────────────────────────────────────────
# ANTES DE CORRERLO LA PRIMERA VEZ
# ─────────────────────────────────────────────────────────────
#
# Para respaldar la base hace falta la cadena de conexión. Se saca
# de Supabase: Project Settings > Database > Connection string >
# URI, y ahí mismo se muestra la contraseña.
#
# Se pasa como variable de entorno, NO se escribe en este archivo
# (si se escribe aquí, termina subida a GitHub y entonces cualquiera
# con acceso al repositorio tiene la base entera):
#
#     export SUPABASE_DB_URL='postgresql://postgres:LACONTRASEÑA@db.iloetojomzqtadkithtv.supabase.co:5432/postgres'
#     bash herramientas/respaldo.sh
#
# Hace falta tener pg_dump instalado:
#     Mac:    brew install libpq && brew link --force libpq
#     Ubuntu: sudo apt install postgresql-client
#
# Si no se define SUPABASE_DB_URL, el script respalda nada más el
# código y avisa que faltó la parte importante.

set -uo pipefail

FECHA=$(date +%Y-%m-%d_%H%M)
DESTINO=~/respaldos-kwpremier/$FECHA
RAIZ=$(git rev-parse --show-toplevel 2>/dev/null)

if [ -z "${RAIZ:-}" ]; then
  echo "Error: hay que correr esto adentro del repositorio."
  exit 1
fi

mkdir -p "$DESTINO"
echo "Respaldando en: $DESTINO"
echo

# ── 1. El código, con toda su historia ──
echo "[1/2] Código..."
cd "$RAIZ"

# Si el clon es superficial le falta historia, y el respaldo saldría
# incompleto sin avisar. Se completa antes de empaquetar.
if [ -f .git/shallow ]; then
  echo "      El clon estaba incompleto; bajando el resto de la historia..."
  git fetch --unshallow origin 2>/dev/null || git fetch --all 2>/dev/null
fi

git bundle create "$DESTINO/codigo.bundle" --all 2>&1 | grep -v '^$' | sed 's/^/      /'

# Un respaldo que no se ha probado no es un respaldo: se verifica
# que de verdad se pueda restaurar.
if git bundle verify "$DESTINO/codigo.bundle" 2>&1 | grep -q "complete history"; then
  COMMITS=$(git log --oneline | wc -l | tr -d ' ')
  echo "      OK: $COMMITS commits, historia completa y verificada."
else
  echo "      CUIDADO: el bundle NO quedó completo. Revísalo antes de confiar en él."
fi

# ── 2. La base de datos, que es la que importa ──
echo
echo "[2/2] Base de datos..."

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "      SALTADO: no se definió SUPABASE_DB_URL."
  echo
  echo "      Ojo: esta era la parte importante. El código ya estaba"
  echo "      a salvo en GitHub; los contratos no. Lee el encabezado"
  echo "      de este archivo para ver cómo configurarlo."
elif ! command -v pg_dump >/dev/null 2>&1; then
  echo "      SALTADO: no está instalado pg_dump."
  echo "      Mac: brew install libpq && brew link --force libpq"
  echo "      Ubuntu: sudo apt install postgresql-client"
else
  # --no-owner y --no-acl para que el volcado se pueda restaurar en
  # otro proyecto de Supabase, no solo en este.
  if pg_dump "$SUPABASE_DB_URL" \
       --no-owner --no-acl \
       --schema=public \
       --file="$DESTINO/base-de-datos.sql" 2>"$DESTINO/pg_dump-errores.log"; then
    TAM=$(du -h "$DESTINO/base-de-datos.sql" | cut -f1)
    LINEAS=$(wc -l < "$DESTINO/base-de-datos.sql" | tr -d ' ')
    echo "      OK: $TAM, $LINEAS líneas."
    rm -f "$DESTINO/pg_dump-errores.log"
    gzip -f "$DESTINO/base-de-datos.sql"
    echo "      Comprimido a $(du -h "$DESTINO/base-de-datos.sql.gz" | cut -f1)."
  else
    echo "      FALLÓ. El detalle está en $DESTINO/pg_dump-errores.log"
    tail -3 "$DESTINO/pg_dump-errores.log" | sed 's/^/      /'
  fi
fi

echo
echo "─────────────────────────────────────────────"
echo "Listo. Contenido del respaldo:"
ls -lh "$DESTINO" | tail -n +2 | awk '{print "  " $9 "  (" $5 ")"}'
echo
echo "CÓMO SE RESTAURA, llegado el caso:"
echo "  Código:  git clone $DESTINO/codigo.bundle carpeta-nueva"
echo "  Base:    gunzip -c $DESTINO/base-de-datos.sql.gz | psql \"\$SUPABASE_DB_URL\""
echo
echo "Guarda esta carpeta fuera de la computadora (Drive, disco externo,"
echo "lo que sea). Un respaldo que vive en la misma máquina que el"
echo "original no sirve de nada el día que se moje la laptop."
