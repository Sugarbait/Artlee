-- RLS Policies for invoice-reports Storage Bucket

-- Policy 1: Enable upload for authenticated users
CREATE POLICY "Enable upload for authenticated users"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'invoice-reports');

-- Policy 2: Enable download via signed URLs
CREATE POLICY "Enable download via signed URLs"
ON storage.objects
FOR SELECT
TO authenticated, anon
USING (bucket_id = 'invoice-reports');

-- Policy 3: Enable update for authenticated users (optional)
CREATE POLICY "Enable update for authenticated users"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'invoice-reports')
WITH CHECK (bucket_id = 'invoice-reports');

-- Policy 4: Enable delete for authenticated users (optional)
CREATE POLICY "Enable delete for authenticated users"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'invoice-reports');
