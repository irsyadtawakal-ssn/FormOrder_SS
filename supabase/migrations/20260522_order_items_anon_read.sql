-- Allow anon membaca order_items (dibutuhkan halaman status pesanan customer)
-- order_items tidak mengandung data sensitif customer
CREATE POLICY "order_items_anon_read" ON public.order_items
  FOR SELECT TO anon USING (true);
