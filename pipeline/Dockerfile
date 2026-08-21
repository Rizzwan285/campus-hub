# Airflow image for the Campus Hub data pipeline.
#
#   docker build -t campus-hub-pipeline ./pipeline
FROM apache/airflow:2.9.3-python3.11

ARG AIRFLOW_VERSION=2.9.3
ARG PYTHON_VERSION=3.11

USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
      postgresql-client \
      curl \
    && rm -rf /var/lib/apt/lists/*

USER airflow
COPY requirements.txt /tmp/requirements.txt
# Constraints keep the added packages compatible with the base image's Airflow.
RUN pip install --no-cache-dir \
      --constraint "https://raw.githubusercontent.com/apache/airflow/constraints-${AIRFLOW_VERSION}/constraints-${PYTHON_VERSION}.txt" \
      -r /tmp/requirements.txt

COPY --chown=airflow:root dags/    /opt/airflow/dags/
COPY --chown=airflow:root dbt/     /opt/airflow/dbt/
COPY --chown=airflow:root scripts/ /opt/airflow/scripts/
COPY --chown=airflow:root entrypoint.sh /opt/airflow/entrypoint.sh

# The DAGs import the check functions from scripts/, which Airflow does not add
# to sys.path on its own.
ENV PYTHONPATH=/opt/airflow/scripts

CMD ["bash", "/opt/airflow/entrypoint.sh"]
