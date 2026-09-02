-- Тестовые данные (выполняется только на пустой базе)

INSERT INTO users (name, password, role) VALUES
    ('admin', '$2a$10$HtosakHzjcio5/8xKo/FMeSkS2iUQBS0eii21EzBhX6F7Yvs98t86', 'admin'),
    ('user', '$2a$10$OeXvlTRoHVk5xtOFRI7Zye9ABTXgQQcYOxAvdyBfi2wfLTyZ/.XKu', 'user'),
    ('zoo', '$2a$10$1unYX//wixsZ4XwUcYf3jO7RAFBPyaorxj/B0XYndrd4JRsRP5k36', 'zoo')
ON CONFLICT (name) DO NOTHING;

INSERT INTO group_types (name) VALUES
    ('Коровники'),
    ('Склады'),
    ('Отбор животных')
ON CONFLICT (name) DO NOTHING;

INSERT INTO object_types (name, group_flag) VALUES
    ('Коровник', true),
    ('Животное', false),
    ('Инвентарь', false)
ON CONFLICT (name) DO NOTHING;

INSERT INTO groups (group_type_id, name) VALUES
    (1, 'Коровник №1'),
    (1, 'Коровник №2'),
    (2, 'Склад кормов')
ON CONFLICT (group_type_id, name) DO NOTHING;

INSERT INTO measures (name, unit, measure_type) VALUES
    ('Температура', '°C', 'instant'),
    ('Влажность', '%', 'instant'),
    ('Вес', 'кг', 'instant'),
    ('Надой', 'л', 'balance')
ON CONFLICT (name) DO NOTHING;

-- Показатели коровника
INSERT INTO measure_to_object_type (measure_id, object_type_id)
SELECT m.id, ot.id FROM measures m, object_types ot
WHERE m.name IN ('Температура', 'Влажность') AND ot.name = 'Коровник'
ON CONFLICT DO NOTHING;

-- Показатели животного
INSERT INTO measure_to_object_type (measure_id, object_type_id)
SELECT m.id, ot.id FROM measures m, object_types ot
WHERE m.name IN ('Вес', 'Надой') AND ot.name = 'Животное'
ON CONFLICT DO NOTHING;

-- Коровники как объекты
INSERT INTO objects (object_type_id, name)
SELECT ot.id, g.name FROM object_types ot, groups g
WHERE ot.name = 'Коровник' AND g.name IN ('Коровник №1', 'Коровник №2')
ON CONFLICT (object_type_id, name) DO NOTHING;

-- Животные в коровнике №1
INSERT INTO objects (object_type_id, name)
SELECT ot.id, x.name FROM object_types ot, (VALUES ('Зорька'), ('Бурёнка'), ('Милка')) AS x(name)
WHERE ot.name = 'Животное'
ON CONFLICT (object_type_id, name) DO NOTHING;

INSERT INTO object_groups (object_id, group_id)
SELECT o.id, g.id FROM objects o, groups g
WHERE g.name = 'Коровник №1' AND o.name IN ('Зорька', 'Бурёнка', 'Милка')
ON CONFLICT DO NOTHING;

INSERT INTO object_identifiers (object_id, id_type, value)
SELECT o.id, 'ear_tag', 'TAG-' || o.name FROM objects o
WHERE o.name IN ('Зорька', 'Бурёнка', 'Милка')
ON CONFLICT (id_type, value) DO NOTHING;

-- Тестовые измерения
INSERT INTO measure_values (client_uuid, measure_id, object_id, value, measured_at, device_id, author_id)
SELECT gen_random_uuid(), m.id, o.id, 18.5, now() - interval '2 hours', 'web-ui', 1
FROM measures m, objects o
WHERE m.name = 'Температура' AND o.name = 'Коровник №1'
ON CONFLICT DO NOTHING;

INSERT INTO measure_values (client_uuid, measure_id, object_id, value, measured_at, device_id, author_id)
SELECT gen_random_uuid(), m.id, o.id, 82, now() - interval '2 hours', 'web-ui', 1
FROM measures m, objects o
WHERE m.name = 'Влажность' AND o.name = 'Коровник №1'
ON CONFLICT DO NOTHING;

INSERT INTO measure_values (client_uuid, measure_id, object_id, value, measured_at, device_id, author_id)
SELECT gen_random_uuid(), m.id, o.id, 450, now() - interval '1 day', 'web-ui', 2
FROM measures m, objects o
WHERE m.name = 'Вес' AND o.name = 'Зорька'
ON CONFLICT DO NOTHING;
