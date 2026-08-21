-- Airflow keeps ~40 metadata tables. Giving it its own database keeps them out
-- of campus_hub, where the data-quality DAG queries the public schema.
CREATE DATABASE airflow OWNER dev;
