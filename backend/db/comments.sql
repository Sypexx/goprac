-- Комментарии к таблицам и колонкам (видны в DBeaver и pgAdmin)

COMMENT ON DATABASE goprac IS 'Учёт измерений коровников: объекты, группы, показатели, оффлайн-синхронизация';

COMMENT ON TABLE users IS 'Сотрудники: операторы, зоотехники';
COMMENT ON COLUMN users.role IS 'Роль: operator | zootechnician | admin';

COMMENT ON TABLE group_types IS 'Типы групп: Коровники, Склады, Отбор животных';

COMMENT ON TABLE groups IS 'Иерархия групп: Коровник №1, Склад кормов';
COMMENT ON COLUMN groups.parent_id IS 'Родительская группа (иерархия)';

COMMENT ON TABLE object_types IS 'Типы объектов. group_flag=true — для групповых типов экземпляры не создаются';
COMMENT ON COLUMN object_types.group_flag IS 'true — тип является группой (Коровник), false — обычный тип (Животное)';

COMMENT ON TABLE objects IS 'Единый реестр экземпляров: животные, коровники, инвентарь';
COMMENT ON COLUMN objects.is_active IS 'false = архив (удалённые не удаляем физически)';

COMMENT ON TABLE object_identifiers IS 'RFID, бирки, чипы. Поиск по метке сканером';
COMMENT ON COLUMN object_identifiers.id_type IS 'rfid | ear_tag | chip';

COMMENT ON TABLE object_groups IS 'm:n — объект может состоять в нескольких группах';

COMMENT ON TABLE object_history IS 'Аудит перемещений: added | removed | moved';
COMMENT ON COLUMN object_history.action IS 'added — добавлен в группу, removed — убран, moved — перемещён';

COMMENT ON TABLE measures IS 'Показатели: температура, вес, надой...';
COMMENT ON COLUMN measures.measure_type IS 'instant — замена значения; balance — накопление (обороты)';
COMMENT ON COLUMN measures.data_type IS 'numeric | text | bool';

COMMENT ON TABLE measure_to_object_type IS 'Какие показатели у какого типа объектов';
COMMENT ON COLUMN measure_to_object_type.is_required IS 'Обязателен ли показатель для этого типа';

COMMENT ON TABLE measure_values IS 'Сырые измерения. client_uuid — идемпотентность оффлайн-синхронизации: повторная отправка не создаёт дубль';
COMMENT ON COLUMN measure_values.client_uuid IS 'UUID, генерируемый на устройстве при создании записи';
COMMENT ON COLUMN measure_values.device_id IS 'Идентификатор устройства-источника (tablet-1, web-ui...)';
COMMENT ON COLUMN measure_values.synced_at IS 'Когда запись попала на сервер';

-- Планируемые таблицы (оборотные регистры, характеристики) пока не созданы —
-- их описание живёт в docs/schema.dbml и будет добавлено вместе с таблицами.
