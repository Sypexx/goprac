-- MVP-схема: реестр объектов, группы, показатели, значения, синхронизация

-- Пользователи (кто вводит данные)
CREATE TABLE IF NOT EXISTS users (
    id       BIGSERIAL PRIMARY KEY,
    name     TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,  -- bcrypt хеш
    role     TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user', 'zoo')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Справочник типов групп: Склады, Коровники, Отбор животных и т.п.
CREATE TABLE IF NOT EXISTS group_types (
    id      BIGSERIAL PRIMARY KEY,
    name    TEXT NOT NULL UNIQUE
);

-- Иерархия групп (коровник №1, склад кормов, ...)
CREATE TABLE IF NOT EXISTS groups (
    id             BIGSERIAL PRIMARY KEY,
    group_type_id  BIGINT NOT NULL REFERENCES group_types(id),
    parent_id      BIGINT REFERENCES groups(id),
    name           TEXT NOT NULL,
    UNIQUE (group_type_id, name)
);

-- Типы объектов: Коровник, Животное, Датчик, Инвентарь...
-- group_flag: для групповых типов экземпляры не создаются
CREATE TABLE IF NOT EXISTS object_types (
    id          BIGSERIAL PRIMARY KEY,
    parent_id   BIGINT REFERENCES object_types(id),
    name        TEXT NOT NULL UNIQUE,
    group_flag  BOOLEAN NOT NULL DEFAULT false
);

-- Единый реестр экземпляров объектов (животные, коровники, инвентарь)
CREATE TABLE IF NOT EXISTS objects (
    id              BIGSERIAL PRIMARY KEY,
    object_type_id  BIGINT NOT NULL REFERENCES object_types(id),
    name            TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (object_type_id, name)
);

-- Идентификаторы объекта: RFID, бирка, чип (у одного объекта их может быть несколько)
CREATE TABLE IF NOT EXISTS object_identifiers (
    id         BIGSERIAL PRIMARY KEY,
    object_id  BIGINT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    id_type    TEXT NOT NULL,          -- 'rfid' | 'ear_tag' | 'chip'
    value      TEXT NOT NULL,
    UNIQUE (id_type, value)
);

-- Принадлежность объекта группам (m:n)
CREATE TABLE IF NOT EXISTS object_groups (
    object_id  BIGINT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    group_id   BIGINT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    PRIMARY KEY (object_id, group_id)
);

-- История перемещений между группами
CREATE TABLE IF NOT EXISTS object_history (
    id         BIGSERIAL PRIMARY KEY,
    object_id  BIGINT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    group_id   BIGINT REFERENCES groups(id),
    action     TEXT NOT NULL,          -- 'added' | 'removed' | 'moved'
    author_id  BIGINT REFERENCES users(id),
    acted_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Показатели: температура, вес, надой...
-- measure_type: 'instant' — замена старого значения, 'balance' — накопление (обороты)
CREATE TABLE IF NOT EXISTS measures (
    id            BIGSERIAL PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    data_type     TEXT NOT NULL DEFAULT 'numeric',  -- numeric | text | bool
    unit          TEXT,
    measure_type  TEXT NOT NULL DEFAULT 'instant' CHECK (measure_type IN ('instant', 'balance'))
);

-- Привязка показателей к типам объектов
CREATE TABLE IF NOT EXISTS measure_to_object_type (
    measure_id      BIGINT NOT NULL REFERENCES measures(id) ON DELETE CASCADE,
    object_type_id  BIGINT NOT NULL REFERENCES object_types(id) ON DELETE CASCADE,
    is_required     BOOLEAN NOT NULL DEFAULT false,
    custom_name     TEXT,
    PRIMARY KEY (measure_id, object_type_id)
);

-- Значения показателей.
-- client_uuid генерируется на устройстве — идемпотентность оффлайн-синхронизации:
-- повторная отправка не создаёт дубль (ON CONFLICT DO NOTHING).
CREATE TABLE IF NOT EXISTS measure_values (
    id           BIGSERIAL PRIMARY KEY,
    client_uuid  UUID NOT NULL UNIQUE,
    measure_id   BIGINT NOT NULL REFERENCES measures(id),
    object_id    BIGINT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    value        NUMERIC NOT NULL,
    measured_at  TIMESTAMPTZ NOT NULL,
    device_id    TEXT NOT NULL DEFAULT 'unknown',
    author_id    BIGINT REFERENCES users(id),
    synced_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_measure_values_object ON measure_values (object_id, measure_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_measure_values_time ON measure_values (measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_objects_type ON objects (object_type_id);
CREATE INDEX IF NOT EXISTS idx_object_groups_group ON object_groups (group_id);
