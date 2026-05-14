<?php

namespace App\Http\Controllers;

use App\Models\ProgressEntry;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class ProgressController extends Controller
{
    /** GET /api/progress — últimos 90 días del usuario autenticado */
    public function index(Request $request): JsonResponse
    {
        $entries = ProgressEntry::where('user_id', $request->user()->id)
            ->where('date', '>=', now()->subDays(90)->toDateString())
            ->orderBy('date', 'asc')
            ->get(['id', 'date', 'reps', 'distance', 'notes']);

        return response()->json($entries);
    }

    /** POST /api/progress — registrar una entrada */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'date'     => 'required|date_format:Y-m-d|before_or_equal:today',
            'reps'     => 'required|integer|min:0|max:99999',
            'distance' => 'required|numeric|min:0|max:9999',
            'notes'    => 'nullable|string|max:255',
        ]);

        $entry = ProgressEntry::create([
            ...$validated,
            'user_id' => $request->user()->id,
        ]);

        return response()->json($entry, 201);
    }

    /** DELETE /api/progress/{id} — borrar (solo registros propios) */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $entry = ProgressEntry::where('id', $id)
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        $entry->delete();

        return response()->json(['message' => 'Registro eliminado.']);
    }
}
