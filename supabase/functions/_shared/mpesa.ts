import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": Deno.env.get("SITE_ORIGIN") || "*",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing Supabase function secret: ${name}`);
  }
  return value;
}

export function darajaBaseUrl() {
  const environment = Deno.env.get("MPESA_ENVIRONMENT") || "sandbox";
  if (environment === "sandbox") {
    return "https://sandbox.safaricom.co.ke";
  }
  if (environment === "production") {
    return "https://api.safaricom.co.ke";
  }
  throw new Error("MPESA_ENVIRONMENT must be sandbox or production.");
}

export function normalizeKenyanPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (/^0[17]\d{8}$/.test(digits)) {
    return `254${digits.slice(1)}`;
  }
  if (/^[17]\d{8}$/.test(digits)) {
    return `254${digits}`;
  }
  if (/^254[17]\d{8}$/.test(digits)) {
    return digits;
  }
  throw new Error("Enter a valid Kenyan mobile number, such as 0712345678.");
}

export function darajaTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}${value.month}${value.day}${value.hour}${value.minute}${value.second}`;
}

export function createServiceClient() {
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function darajaAccessToken() {
  const credentials = btoa(
    `${requiredEnv("MPESA_CONSUMER_KEY")}:${requiredEnv("MPESA_CONSUMER_SECRET")}`,
  );
  const response = await fetch(
    `${darajaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${credentials}` } },
  );
  const result = await response.json();
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description || "Could not authenticate with M-Pesa Daraja.");
  }
  return result.access_token as string;
}

export function stkPassword(timestamp: string) {
  return btoa(
    `${requiredEnv("MPESA_SHORTCODE")}${requiredEnv("MPESA_PASSKEY")}${timestamp}`,
  );
}
