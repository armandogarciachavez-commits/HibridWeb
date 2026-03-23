<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use App\Models\User;
use App\Models\Membership;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class PaymentController extends Controller
{
    private $mpAccessToken;

    public function __construct()
    {
        // En producción, esto debe venir de env('MERCADOPAGO_ACCESS_TOKEN')
        $this->mpAccessToken = env('MERCADOPAGO_ACCESS_TOKEN', 'APP_USR-5582319082352882-031912-1f81d1e43ed4e12e035417fb74209939-123456789'); // Dummy token for sandbox
    }

    public function createPreference(Request $request)
    {
        // 1. Validar el usuario e información del cobro
        $user = $request->user();
        if (!$user) {
            // For testing from local without token if needed, fallback to first user
            $user = User::first(); 
        }

        // 2. Crear el payload para Mercado Pago
        $preferenceData = [
            'items' => [
                [
                    'id' => 'MEMB_MENSUAL',
                    'title' => 'Renovación Mensual - Hybrid Training',
                    'description' => 'Membresía mensual de acceso al gimnasio',
                    'quantity' => 1,
                    'currency_id' => 'MXN',
                    'unit_price' => 500.00 // Precio ejemplo
                ]
            ],
            'payer' => [
                'name' => $user->name,
                'email' => $user->email,
            ],
            'back_urls' => [
                'success' => 'http://localhost:4174/#/?payment=success',
                'failure' => 'http://localhost:4174/#/?payment=failure',
                'pending' => 'http://localhost:4174/#/?payment=pending'
            ],
            'auto_return' => 'approved',
            // En metadata enviamos nuestro user_id para procesarlo en el Webhook
            'metadata' => [
                'hybrid_user_id' => $user->id,
                'plan_type' => 'mensual'
            ],
            // 'notification_url' => 'https://tudominio.com/api/payments/webhook' // Required for production webhooks
        ];

        // 3. Enviar petición a la API de Mercado Pago
        $response = Http::withToken($this->mpAccessToken)
            ->post('https://api.mercadopago.com/checkout/preferences', $preferenceData);

        if ($response->successful()) {
            return response()->json([
                'id' => $response->json()['id'],
                'init_point' => $response->json()['init_point'], // Pro checkout
                'sandbox_init_point' => $response->json()['sandbox_init_point'] // Sandbox checkout
            ]);
        }

        Log::error('MercadoPago Error: ' . $response->body());
        return response()->json(['error' => 'No se pudo crear la preferencia de pago'], 500);
    }

    public function webhook(Request $request)
    {
        // MercadoPago envía confirmaciones aquí (IPN)
        Log::info('Webhook de Mercado Pago Recibido', $request->all());

        if ($request->type === 'payment') {
            $paymentId = $request->data['id'];

            // Consultar el estado real del pago en la API
            $paymentInfo = Http::withToken($this->mpAccessToken)
                ->get("https://api.mercadopago.com/v1/payments/$paymentId");

            if ($paymentInfo->successful() && $paymentInfo->json()['status'] === 'approved') {
                $paymentData = $paymentInfo->json();
                $hybridUserId = $paymentData['metadata']['hybrid_user_id'] ?? null;
                $planType = $paymentData['metadata']['plan_type'] ?? 'mensual';

                if ($hybridUserId) {
                    $this->renewUserMembership($hybridUserId, $planType);
                    Log::info("Membresía renovada automáticamente para User ID: $hybridUserId");
                }
            }
        }

        return response()->json(['status' => 'ok'], 200);
    }

    private function renewUserMembership($userId, $planType)
    {
        // Desactivar las anteriores
        Membership::where('user_id', $userId)->update(['is_active' => false]);

        // Crear la nueva con 1 mes de vigencia
        Membership::create([
            'user_id' => $userId,
            'plan_type' => $planType,
            'start_date' => Carbon::now(),
            'end_date' => Carbon::now()->addMonth(),
            'is_active' => true
        ]);
    }
}
