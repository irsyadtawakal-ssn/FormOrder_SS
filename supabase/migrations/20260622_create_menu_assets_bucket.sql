-- Create the bucket for menu assets and banner
INSERT INTO storage.buckets (id, name, public)
VALUES ('menu_assets', 'menu_assets', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for the bucket
-- 1. Allow public read access to the files (for the banner and menu images to show to users)
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'menu_assets' );

-- 2. Allow users to upload files
CREATE POLICY "Allow uploads"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'menu_assets' );

-- 3. Allow users to update files
CREATE POLICY "Allow updates"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'menu_assets' );

-- 4. Allow users to delete files
CREATE POLICY "Allow deletes"
ON storage.objects FOR DELETE
USING ( bucket_id = 'menu_assets' );
