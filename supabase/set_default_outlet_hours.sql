ALTER TABLE outlets ALTER COLUMN open_hour SET DEFAULT '14:00:00';
ALTER TABLE outlets ALTER COLUMN close_hour SET DEFAULT '22:00:00';

CREATE OR REPLACE FUNCTION set_default_outlet_hours()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug != 'outlet-tes' THEN
    IF NEW.open_hour IS NULL THEN
      NEW.open_hour := '14:00:00'::time;
    END IF;
    IF NEW.close_hour IS NULL THEN
      NEW.close_hour := '22:00:00'::time;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_default_outlet_hours ON outlets;
CREATE TRIGGER trg_set_default_outlet_hours
BEFORE INSERT OR UPDATE ON outlets
FOR EACH ROW
EXECUTE FUNCTION set_default_outlet_hours();
