-- Run this in Supabase SQL Editor to add TPI column for Teacher Performance Index
ALTER TABLE session_analytics ADD COLUMN IF NOT EXISTS tpi FLOAT;
