<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use App\Models\Membership;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'username' => 'required|string|max:255|unique:users',
            'email' => 'nullable|string|email|max:255|unique:users',
            'phone' => 'required|string|max:255',
            'address' => 'required|string',
            'password' => 'required|string|min:6',
            'emergency_contact_name' => 'nullable|string|max:255',
            'emergency_contact_phone' => 'nullable|string|max:255',
            'plan_type' => 'nullable|string',
        ]);

        $user = User::create([
            'name' => $request->name,
            'username' => $request->username,
            'email' => $request->email ?? null,
            'phone' => $request->phone,
            'address' => $request->address,
            'password' => Hash::make($request->password),
            'emergency_contact_name' => $request->emergency_contact_name ?? null,
            'emergency_contact_phone' => $request->emergency_contact_phone ?? null,
            'role' => 'socio'
        ]);

        // If a public visitor selected a specific plan for immediate enrollment
        if ($request->filled('plan_type') && $request->plan_type !== 'none') {
            
            $months = 1;
            if ($request->plan_type === 'anual') $months = 12;
            if ($request->plan_type === 'trimestre') $months = 3;
            if ($request->plan_type === 'bimestre') $months = 2; // For hybrid test scenarios

            Membership::create([
                'user_id' => $user->id,
                'plan_type' => $request->plan_type,
                'start_date' => now(),
                'end_date' => now()->addMonths($months),
                'is_active' => true
            ]);
        }

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'message' => 'Cuenta y membresía generada exitosamente.',
            'user' => $user,
            'token' => $token
        ]);
    }

    public function login(Request $request)
    {
        $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
        ]);

        $user = User::where('username', $request->username)->first();

        // Check password conceptually since we might or might not hash it depending on Phase 1 logic, 
        // but let's assume standard Laravel hashing.
        if (! $user || ! Hash::check($request->password, $user->password)) {
            return response()->json([
                'message' => 'Credenciales incorrectas.'
            ], 401);
        }

        // Return Sanctum token
        return response()->json([
            'user' => $user,
            'token' => $user->createToken('auth_token')->plainTextToken
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        
        return response()->json([
            'message' => 'Sesión cerrada exitosamente.'
        ]);
    }
}
