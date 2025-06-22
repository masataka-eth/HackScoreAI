-- Enable pgcrypto extension for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create secrets table for storing API keys
CREATE TABLE IF NOT EXISTS public.user_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    secret_type VARCHAR(50) NOT NULL, -- 'anthropic_key', 'github_token', etc.
    secret_name VARCHAR(100) NOT NULL,
    encrypted_secret TEXT NOT NULL, -- PGP encrypted value
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, secret_type, secret_name)
);

-- Create indexes for faster lookups
CREATE INDEX idx_user_secrets_user_id ON public.user_secrets(user_id);
CREATE INDEX idx_user_secrets_type ON public.user_secrets(secret_type);

-- Create updated_at trigger
CREATE TRIGGER update_user_secrets_updated_at 
    BEFORE UPDATE ON public.user_secrets
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();

-- RLS policies for user_secrets
ALTER TABLE public.user_secrets ENABLE ROW LEVEL SECURITY;

-- Users can only access their own secrets
CREATE POLICY "Users can manage their own secrets"
    ON public.user_secrets
    FOR ALL
    USING (auth.uid() = user_id);

-- Service role can access all secrets (for Edge Functions)
CREATE POLICY "Service role can access all secrets"
    ON public.user_secrets
    FOR ALL
    TO service_role
    USING (true);

-- Function to get encryption key from environment
CREATE OR REPLACE FUNCTION get_vault_key()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- In production, this would be from a more secure source
    -- For development, we use a simple key
    RETURN 'hackscore-ai-vault-secret-key-2025';
END;
$$;

-- Function to store a secret with encryption
CREATE OR REPLACE FUNCTION store_user_secret(
    p_user_id UUID,
    p_secret_type VARCHAR(50),
    p_secret_name VARCHAR(100),
    p_secret_value TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    secret_id UUID;
    encrypted_value TEXT;
    vault_key TEXT;
BEGIN
    -- Get the vault key
    vault_key := get_vault_key();
    
    -- Encrypt the secret using pgcrypto
    encrypted_value := encode(
        encrypt(p_secret_value::bytea, vault_key::bytea, 'aes'), 
        'base64'
    );
    
    -- Insert or update the secret
    INSERT INTO public.user_secrets (user_id, secret_type, secret_name, encrypted_secret)
    VALUES (p_user_id, p_secret_type, p_secret_name, encrypted_value)
    ON CONFLICT (user_id, secret_type, secret_name)
    DO UPDATE SET 
        encrypted_secret = EXCLUDED.encrypted_secret,
        updated_at = NOW()
    RETURNING id INTO secret_id;
    
    RETURN secret_id;
END;
$$;

-- Function to retrieve a secret with decryption
CREATE OR REPLACE FUNCTION get_user_secret(
    p_user_id UUID,
    p_secret_type VARCHAR(50),
    p_secret_name VARCHAR(100)
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    encrypted_value TEXT;
    decrypted_value TEXT;
    vault_key TEXT;
BEGIN
    -- Get the encrypted secret
    SELECT encrypted_secret INTO encrypted_value
    FROM public.user_secrets
    WHERE user_id = p_user_id 
        AND secret_type = p_secret_type 
        AND secret_name = p_secret_name;
    
    IF encrypted_value IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Get the vault key
    vault_key := get_vault_key();
    
    -- Decrypt the secret
    decrypted_value := convert_from(
        decrypt(decode(encrypted_value, 'base64'), vault_key::bytea, 'aes'),
        'UTF8'
    );
    
    RETURN decrypted_value;
END;
$$;

-- Function to list user's secrets (without values)
CREATE OR REPLACE FUNCTION list_user_secrets(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    secret_type VARCHAR(50),
    secret_name VARCHAR(100),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        us.id,
        us.secret_type,
        us.secret_name,
        us.created_at,
        us.updated_at
    FROM public.user_secrets us
    WHERE us.user_id = p_user_id
    ORDER BY us.created_at DESC;
END;
$$;

-- Function for Edge Functions to get secrets (requires service role)
CREATE OR REPLACE FUNCTION get_secret_for_job(
    p_user_id UUID,
    p_secret_type VARCHAR(50)
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    encrypted_value TEXT;
    decrypted_value TEXT;
    vault_key TEXT;
BEGIN
    -- Get the most recent secret of this type for the user
    SELECT encrypted_secret INTO encrypted_value
    FROM public.user_secrets
    WHERE user_id = p_user_id 
        AND secret_type = p_secret_type
    ORDER BY updated_at DESC
    LIMIT 1;
    
    IF encrypted_value IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Get the vault key
    vault_key := get_vault_key();
    
    -- Decrypt the secret
    decrypted_value := convert_from(
        decrypt(decode(encrypted_value, 'base64'), vault_key::bytea, 'aes'),
        'UTF8'
    );
    
    RETURN decrypted_value;
END;
$$;

-- Insert some test secrets for development
DO $$
DECLARE
    test_user_id UUID;
BEGIN
    -- Create a test user if it doesn't exist
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        created_at,
        updated_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_super_admin,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        '11111111-1111-1111-1111-111111111111',
        'authenticated',
        'authenticated',
        'test@example.com',
        crypt('password123', gen_salt('bf')),
        NOW(),
        NOW(),
        NOW(),
        '{"provider":"email","providers":["email"]}',
        '{}',
        false,
        '',
        '',
        '',
        ''
    ) ON CONFLICT (id) DO NOTHING;
    
    test_user_id := '11111111-1111-1111-1111-111111111111';
    
    -- Store test secrets
    PERFORM store_user_secret(
        test_user_id,
        'anthropic_key',
        'default',
        'sk-ant-api03-test-key-for-development'
    );
    
    PERFORM store_user_secret(
        test_user_id,
        'github_token',
        'default',
        'ghp_test-token-for-development-testing'
    );
END $$;