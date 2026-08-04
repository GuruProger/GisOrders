#!/bin/bash
set -e

# Создаём тестовую БД
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE gisorders_test;
EOSQL

# Включаем PostGIS в тестовой БД
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "gisorders_test" <<-EOSQL
    CREATE EXTENSION IF NOT EXISTS postgis;
    CREATE EXTENSION IF NOT EXISTS postgis_topology;
EOSQL