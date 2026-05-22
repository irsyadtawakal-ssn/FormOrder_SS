-- Nonaktifkan service fee sementara (manual transfer tidak perlu biaya gateway)
INSERT INTO app_settings (key, value, description)
VALUES ('service_fee_percent', '0', 'Persentase biaya layanan (0 = nonaktif)')
ON CONFLICT (key) DO UPDATE SET value = '0', updated_at = now();
