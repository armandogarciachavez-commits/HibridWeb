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

    public function generateCatalog()
    {
        $defaults = [
            // Ingresos
            ['name' => 'Mensualidad',           'type' => 'ingreso', 'description' => 'Pago de membresía mensual'],
            ['name' => 'Inscripción',            'type' => 'ingreso', 'description' => 'Pago de inscripción o reactivación'],
            ['name' => 'Bimestre',               'type' => 'ingreso', 'description' => 'Membresía bimestral'],
            ['name' => 'Trimestre',              'type' => 'ingreso', 'description' => 'Membresía trimestral'],
            ['name' => 'Anualidad',              'type' => 'ingreso', 'description' => 'Membresía anual'],
            ['name' => 'Venta de producto',      'type' => 'ingreso', 'description' => 'Venta de suplementos u otros productos'],
            ['name' => 'Clase especial',         'type' => 'ingreso', 'description' => 'Clase fuera del horario regular o taller'],
            ['name' => 'Clase de prueba',        'type' => 'ingreso', 'description' => 'Visita o clase de cortesía pagada'],
            ['name' => 'Día suelto',             'type' => 'ingreso', 'description' => 'Acceso de un solo día'],
            ['name' => 'Otro ingreso',           'type' => 'ingreso', 'description' => 'Ingreso no clasificado'],
            // Egresos
            ['name' => 'Renta',                  'type' => 'egreso',  'description' => 'Pago de renta del local'],
            ['name' => 'Nómina',                 'type' => 'egreso',  'description' => 'Pago de sueldos al personal'],
            ['name' => 'Servicios',              'type' => 'egreso',  'description' => 'Agua, luz, internet, gas'],
            ['name' => 'Mantenimiento',          'type' => 'egreso',  'description' => 'Reparaciones y mantenimiento del equipo'],
            ['name' => 'Compra de inventario',   'type' => 'egreso',  'description' => 'Reabastecimiento de productos para venta'],
            ['name' => 'Limpieza e insumos',     'type' => 'egreso',  'description' => 'Productos de limpieza y consumibles'],
            ['name' => 'Publicidad',             'type' => 'egreso',  'description' => 'Redes sociales, flyers, promoción'],
            ['name' => 'Equipo y material',      'type' => 'egreso',  'description' => 'Compra o renta de equipo de gimnasio'],
            ['name' => 'Contabilidad / Legal',   'type' => 'egreso',  'description' => 'Honorarios contables o legales'],
            ['name' => 'Otro egreso',            'type' => 'egreso',  'description' => 'Egreso no clasificado'],
        ];

        $created = 0;
        foreach ($defaults as $item) {
            $exists = AccountingConcept::where('name', $item['name'])->where('type', $item['type'])->exists();
            if (!$exists) {
                AccountingConcept::create($item);
                $created++;
            }
        }

        return response()->json([
            'message' => $created > 0
                ? "Se generaron {$created} conceptos del catálogo base."
                : 'El catálogo ya estaba completo. No se duplicaron entradas.',
            'created' => $created,
        ]);
    }
}
