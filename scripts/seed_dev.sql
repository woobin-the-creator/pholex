-- =============================================================================
-- Pholex 개발 환경 시드 데이터
-- 대상: 사외 개발 컴퓨터 (DEV_SSO_BYPASS=true 환경)
--
-- 실행 방법:
--   docker compose -p pholex-dev exec -T postgres \
--     psql -U pholex -d pholex -f /dev/stdin < scripts/seed_dev.sql
--
-- 전제조건:
--   - Alembic 마이그레이션 완료 후 실행
--   - DEV_SSO_USER_ID=test001, DEV_SSO_EMPLOYEE_NUMBER=99999 기준
-- =============================================================================

-- 기존 시드 데이터 초기화 (재실행 안전)
DELETE FROM lot_status;
DELETE FROM users WHERE employee_id = 'test001';

-- =============================================================================
-- 테스트 사용자 (DEV_SSO_BYPASS 계정과 동일)
-- =============================================================================
INSERT INTO users (employee_id, employee_number, username, email, auth)
VALUES ('test001', '99999', '테스트엔지니어', 'test@dev.local', 'ENGINEER');

-- =============================================================================
-- 슬롯 [1] "내 lot hold" 에 표시되어야 하는 행
-- 조건: status='hold' AND hold_operator_id=99999
-- =============================================================================
INSERT INTO lot_status (lot_id, status, equipment, process_step, hold_comment, hold_operator_id, updated_at)
VALUES
    ('LOT-HOLD-001', 'hold', 'EQ-CVD-01', 'CVD-DEPO-10',  '챔버 압력 이상 — 엔지니어 확인 필요',  99999, NOW() - INTERVAL '5 minutes'),
    ('LOT-HOLD-002', 'hold', 'EQ-ETCH-03', 'ETCH-DRY-25', '자재 부족 — 웨이퍼 공급 대기',         99999, NOW() - INTERVAL '23 minutes'),
    ('LOT-HOLD-003', 'hold', 'EQ-IMP-02',  'IMP-ANNEAL-8','장비 PM 완료 후 재개 예정',             99999, NOW() - INTERVAL '2 hours');

-- =============================================================================
-- 슬롯 [1] 에 표시되면 안 되는 행 — 다른 사용자의 hold 랏
-- 조건: status='hold' BUT hold_operator_id≠99999
-- =============================================================================
INSERT INTO lot_status (lot_id, status, equipment, process_step, hold_comment, hold_operator_id, updated_at)
VALUES
    ('LOT-HOLD-OTHER-001', 'hold', 'EQ-CMP-01', 'CMP-POLISH-3', '슬러리 교체 필요', 88888, NOW() - INTERVAL '10 minutes'),
    ('LOT-HOLD-OTHER-002', 'hold', 'EQ-CVD-04', 'CVD-DEPO-15',  '레시피 검토 중',   77777, NOW() - INTERVAL '1 hour');

-- =============================================================================
-- 슬롯 [1] 에 표시되면 안 되는 행 — 내 랏이지만 status가 hold가 아님
-- =============================================================================
INSERT INTO lot_status (lot_id, status, equipment, process_step, hold_operator_id, updated_at)
VALUES
    ('LOT-RUN-001',  'run',  'EQ-ETCH-01', 'ETCH-DRY-12',  99999, NOW() - INTERVAL '3 minutes'),
    ('LOT-RUN-002',  'run',  'EQ-CVD-02',  'CVD-DEPO-7',   99999, NOW() - INTERVAL '8 minutes'),
    ('LOT-WAIT-001', 'wait', 'EQ-IMP-01',  'IMP-IMPLANT-2', 99999, NOW() - INTERVAL '30 minutes'),
    ('LOT-WAIT-002', 'wait', 'EQ-CMP-03',  'CMP-POLISH-1',  99999, NOW() - INTERVAL '45 minutes');

-- =============================================================================
-- 확인 쿼리 (실행 후 결과로 시드 성공 여부 확인)
-- =============================================================================
SELECT '=== 전체 lot_status ===' AS info;
SELECT lot_id, status, hold_operator_id FROM lot_status ORDER BY status, lot_id;

SELECT '=== 슬롯 [1] 표시 예상 (3건) ===' AS info;
SELECT lot_id, equipment, process_step, hold_comment, hold_operator_id
FROM lot_status
WHERE status = 'hold' AND hold_operator_id = 99999
ORDER BY updated_at DESC;
