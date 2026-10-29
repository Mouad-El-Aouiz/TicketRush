ALTER TABLE users ADD CONSTRAINT valid_role CHECK (role IN ('CLIENT','ORGANISATEUR','CONTROLEUR','ADMIN'));
ALTER TABLE events ADD CONSTRAINT valid_event_status CHECK (status IN ('DRAFT','PUBLISHED','WITHDRAWN'));
ALTER TABLE categories ADD CONSTRAINT valid_category CHECK (capacity > 0 AND "priceCents" >= 0);
ALTER TABLE holds ADD CONSTRAINT valid_hold CHECK (quantity > 0 AND "unitPriceCents" >= 0 AND status IN ('ACTIVE','PAID','EXPIRED'));
ALTER TABLE orders ADD CONSTRAINT valid_order CHECK ("totalCents" >= 0 AND status IN ('PENDING','PAID','EXPIRED'));
ALTER TABLE payments ADD CONSTRAINT valid_payment CHECK ("amountCents" >= 0 AND status IN ('PENDING','FAILED','SUCCEEDED','REFUNDED'));
ALTER TABLE tickets ADD CONSTRAINT valid_ticket CHECK ("seatIndex" >= 0);
