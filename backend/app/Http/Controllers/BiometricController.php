<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use App\Models\Fingerprint;
use App\Models\ScanLog;

class BiometricController extends Controller
{
    /**
     * Endpoint for enrolling a new fingerprint from the reception desk.
     */
    public function enroll(Request $request)
    {
        $request->validate([
            'user_id' => 'required|exists:users,id',
            'template_data' => 'required|string',
            'finger_index' => 'integer|min:0|max:9'
        ]);

        $fingerprint = Fingerprint::updateOrCreate(
            [
                'user_id' => $request->user_id,
                'finger_index' => $request->finger_index ?? 0,
            ],
            [
                'template_data' => $request->template_data,
                'is_active' => true,
            ]
        );

        return response()->json([
            'message' => 'Fingerprint enrolled successfully',
            'data' => $fingerprint
        ], 201);
    }

    /**
     * Endpoint acting as webhook/receiver when the 4500 Scanner reads a print.
     * The local SDK service should send the recognized user_id (or template to match if matching happens server-side).
     */
    public function verify(Request $request)
    {
        $request->validate([
            'user_id' => 'required|exists:users,id',
            'reader_id' => 'nullable|string'
        ]);

        $user = User::with('memberships')->findOrFail($request->user_id);
        
        // Logical check if user has an active membership
        $hasActiveMembership = $user->memberships()
                                    ->where('is_active', true)
                                    ->whereDate('end_date', '>=', now())
                                    ->exists();

        $status = $hasActiveMembership ? 'granted' : 'denied';

        $scanLog = ScanLog::create([
            'user_id' => $user->id,
            'status' => $status,
            'reader_id' => $request->reader_id ?? 'Main_Turnstile_1',
        ]);

        return response()->json([
            'message' => $status === 'granted' ? 'Access Granted' : 'Access Denied: No active membership',
            'status' => $status,
            'user' => [
                'name' => $user->name,
                'role' => $user->role
            ],
            'log_id' => $scanLog->id
        ], $status === 'granted' ? 200 : 403);
    }

    public function getRecentScan()
    {
        $scan = ScanLog::with([
            'user:id,name,email,role,photo',
            'user.memberships',
            'user.reservations' => function($q) {
                // Return only today's reservations
                $q->whereHas('classSession', function($query) {
                    $query->whereDate('date', now()->toDateString());
                })->with('classSession.gymClass');
            }
        ])
        ->where('scanned_at', '>=', now()->subMinutes(5))
        ->orderBy('scanned_at', 'desc')
        ->first();

        return response()->json($scan);
    }
}
