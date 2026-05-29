"""Postgres `sample` 테이블 schema — 사내 staging 테이블 모방.

사내 AI는 사내 source에서 `SELECT *`로 데이터를 떠서 Pholex Postgres의 `sample`
테이블에 raw로 적재한다 (원본 컬럼명·원본 enum 그대로). 이 모듈은 그 모양을
로컬에서 흉내내기 위한 정의로, `PgSampleLotSource`(읽기)와 seed script(쓰기)가
같은 schema 객체를 공유한다.

raw → canonical 변환은 어댑터(`PgSampleLotSource`) 책임이다. 이 테이블은 raw 그대로
들고 있는다 (last_update_date는 timezone 정보 없는 naive timestamp).
"""

from __future__ import annotations

from sqlalchemy import Column, DateTime, MetaData, String, Table

metadata = MetaData()

# 사내 sample 테이블에서 어댑터가 실제로 읽는 컬럼만 모방한다.
# (사내 원본은 SELECT * 라 컬럼이 더 많지만, fetch_my_holds가 쓰는 7개만 둔다.)
sample_table = Table(
    "sample",
    metadata,
    Column("lot_id", String, primary_key=True),
    Column("lot_status_seg", String, nullable=False),  # raw: Active / Hold / PreActive
    Column("eqp_type", String, nullable=True),
    Column("step_name", String, nullable=True),
    Column("lot_hold_comment", String, nullable=True),
    Column("last_update_date", DateTime(timezone=False), nullable=False),  # naive (KST wall-clock)
    Column("lot_hold_user_id", String(40), nullable=True),  # hold 명령 유저 사번
)
