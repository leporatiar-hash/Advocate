import time
from sqlalchemy import create_engine, event
from sqlalchemy.pool import Pool
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost/truefitmeds")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# TEMP PERF INSTRUMENTATION — remove once the /patients/ and /logs/ latency
# is root-caused. Logs connection-pool checkout wait and per-statement
# execution time to stdout (visible in Railway Deploy Logs) so we can tell
# whether slow requests are stuck waiting for a pooled connection or are
# genuinely slow inside Postgres.
@event.listens_for(Pool, "checkout")
def _perf_pool_checkout(dbapi_conn, connection_record, connection_proxy):
    connection_record.info["checkout_start"] = time.perf_counter()


@event.listens_for(Pool, "checkin")
def _perf_pool_checkin(dbapi_conn, connection_record):
    start = connection_record.info.pop("checkout_start", None)
    if start is not None:
        held_ms = (time.perf_counter() - start) * 1000
        if held_ms > 50:
            print(f"PERF pool: connection held {held_ms:.1f}ms")


@event.listens_for(engine, "before_cursor_execute")
def _perf_before_cursor(conn, cursor, statement, parameters, context, executemany):
    conn.info.setdefault("query_start", []).append(time.perf_counter())


@event.listens_for(engine, "after_cursor_execute")
def _perf_after_cursor(conn, cursor, statement, parameters, context, executemany):
    start = conn.info["query_start"].pop()
    ms = (time.perf_counter() - start) * 1000
    first_line = statement.strip().split("\n")[0][:100]
    print(f"PERF sql {ms:.1f}ms: {first_line}")


def get_db():
    t0 = time.perf_counter()
    db = SessionLocal()
    checkout_ms = (time.perf_counter() - t0) * 1000
    if checkout_ms > 20:
        print(f"PERF get_db: session/connection setup took {checkout_ms:.1f}ms")
    try:
        yield db
    finally:
        db.close()
