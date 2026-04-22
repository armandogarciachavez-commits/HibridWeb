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
            'user_id'    => $user->id,
            'status'     => $status,
            'reader_id'  => $request->reader_id ?? 'Main_Turnstile_1',
            'scanned_at' => now(),
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

    public function getTemplates()
    {
        $fingerprints = \App\Models\Fingerprint::where('is_active', true)
            ->select('user_id', 'template_data', 'finger_index')
            ->get();
        return response()->json($fingerprints);
    }

    /**
     * Returns all active members with minimal data for the bridge's local cache.
     * Called on startup and periodic refresh by the biometric bridge service.
     */
    public function getMembersForBiometric()
    {
        $members = User::with([
            'memberships' => fn($q) => $q->where('is_active', true)
                                         ->whereDate('end_date', '>=', now())
                                         ->orderBy('end_date', 'desc'),
        ])
        ->where('role', 'socio')
        ->get()
        ->map(fn($u) => [
            'id'                    => $u->id,
            'name'                  => $u->name,
            'photo_url'             => $u->photo ? asset('storage/' . $u->photo) : null,
            'role'                  => $u->role,
            'has_active_membership' => $u->memberships->isNotEmpty(),
            'days_left'             => $u->memberships->first()
                ? max(0, (int) now()->diffInDays($u->memberships->first()->end_date, false))
                : 0,
            'end_date'              => optional($u->memberships->first())->end_date,
        ]);

        return response()->json($members);
    }

    /**
     * Receives scan logs queued offline by the bridge when internet was unavailable.
     * Inserts them into scan_logs for historical reporting and attendance tracking.
     */
    public function syncScans(Request $request)
    {
        $data = $request->validate([
            'scans'              => 'required|array',
            'scans.*.user_id'   => 'required|integer|exists:users,id',
            'scans.*.scanned_at' => 'required|string',
            'scans.*.status'    => 'required|in:granted,denied',
        ]);

        $synced = 0;
        foreach ($data['scans'] as $scan) {
            ScanLog::create([
                'user_id'    => $scan['user_id'],
                'status'     => $scan['status'],
                'reader_id'  => 'offline_queue',
                'scanned_at' => $scan['scanned_at'],
            ]);
            $synced++;
        }

        return response()->json(['synced' => $synced]);
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
        ->where('created_at', '>=', now()->subSeconds(30))
        ->orderBy('scanned_at', 'desc')
        ->first();

        return response()->json($scan);
    }
}
