// Supabase configuration
const SUPABASE_URL = 'https://acdtpvezgbwpledvktnr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjZHRwdmV6Z2J3cGxlZHZrdG5yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA4NTQwMDAsImV4cCI6MjA2NjQzMDAwMH0.l2FdklAjlZKqTlt-8XtcRMIYurwwM0rpWVmZo7C21b0';

// Initialize Supabase client
const supabase = supabaseClient.createClient(SUPABASE_URL, SUPABASE_KEY);