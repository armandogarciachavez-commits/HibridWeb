<?php

namespace App\Http\Controllers;

use App\Models\AccountingConcept;
use Illuminate\Http\Request;

class AccountingConceptController extends Controller
{
    public function index(Request $request)
    {
        $query = AccountingConcept::orderBy('type')->orderBy('name');
        if ($request->has('type')) {
            $query->where('type', $request->type);
        }
        return response()->json($query->get());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name'        => 'required|string|max:120',
            'type'        => 'required|in:ingreso,egreso',
            'description' => 'nullable|string|max:255',
        ]);
        $concept = AccountingConcept::create($data);
        return response()->json($concept, 201);
    }

    public function update(Request $request, $id)
    {
        $concept = AccountingConcept::findOrFail($id);
        $data = $request->validate([
            'name'        => 'sometimes|string|max:120',
            'type'        => 'sometimes|in:ingreso,egreso',
            'description' => 'nullable|string|max:255',
            'is_active'   => 'sometimes|boolean',
        ]);
        $concept->update($data);
        return response()->json($concept);
    }

    public function destroy($id)
    {
        $concept = AccountingConcept::findOrFail($id);
        if ($concept->entries()->exists()) {
            return response()->json([
                'message' => 'No se puede eliminar: el concepto tiene movimientos registrados. Puedes desactivarlo.',
            ], 422);
        }
        $concept->delete();
        return response()->json(['message' => 'Concepto eliminado.']);
    }
}
