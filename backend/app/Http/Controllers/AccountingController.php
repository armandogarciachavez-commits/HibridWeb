<?php

namespace App\Http\Controllers;

use App\Models\AccountingEntry;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class AccountingController extends Controller
{
    public function indexToday()
    {
        $today = Carbon::now('UTC')->toDateString();
        $entries = AccountingEntry::with(['concept', 'product', 'createdBy:id,name'])
            ->where('entry_date', $today)
            ->orderBy('created_at', 'desc')
            ->get();

        $totalIngresos = $entries->where('type', 'ingreso')->sum('amount');
        $totalEgresos  = $entries->where('type', 'egreso')->sum('amount');

        return response()->json([
            'entries'          => $entries,
            'total_ingresos'   => round($totalIngresos, 2),
            'total_egresos'    => round($totalEgresos, 2),
            'balance'          => round($totalIngresos - $totalEgresos, 2),
            'date'             => $today,
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'type'        => 'required|in:ingreso,egreso',
            'concept_id'  => 'required|exists:accounting_concepts,id',
            'entry_type'  => 'required|in:manual,product_sale',
            'amount'      => 'required_if:entry_type,manual|nullable|numeric|min:0.01',
            'product_id'  => 'required_if:entry_type,product_sale|nullable|exists:products,id',
            'product_qty' => 'required_if:entry_type,product_sale|nullable|integer|min:1',
            'notes'       => 'nullable|string',
            'entry_date'  => 'nullable|date',
        ]);

        $data['created_by'] = $request->user()?->id;
        $data['entry_date'] = $data['entry_date'] ?? Carbon::now('UTC')->toDateString();

        if ($data['entry_type'] === 'product_sale') {
            $entry = DB::transaction(function () use ($data) {
                $product = Product::lockForUpdate()->findOrFail($data['product_id']);

                if ($product->stock < $data['product_qty']) {
                    abort(422, "Stock insuficiente. Disponible: {$product->stock} {$product->unit}(s).");
                }

                $data['amount'] = round($product->price * $data['product_qty'], 2);
                $data['type']   = 'ingreso';

                $product->decrement('stock', $data['product_qty']);

                return AccountingEntry::create($data);
            });
        } else {
            $entry = AccountingEntry::create($data);
        }

        // Retención: eliminar entradas con más de 2 meses de antigüedad
        $this->purgeOldEntries();

        return response()->json($entry->load(['concept', 'product']), 201);
    }

    private function purgeOldEntries(): void
    {
        $cutoff = Carbon::now('UTC')->subMonths(2)->toDateString();
        AccountingEntry::where('entry_date', '<', $cutoff)->delete();
    }

    public function destroy($id)
    {
        $entry = AccountingEntry::findOrFail($id);

        if ($entry->entry_type === 'product_sale' && $entry->product_id) {
            DB::transaction(function () use ($entry) {
                Product::where('id', $entry->product_id)
                    ->increment('stock', $entry->product_qty);
                $entry->delete();
            });
        } else {
            $entry->delete();
        }

        return response()->json(['message' => 'Movimiento eliminado.']);
    }

    public function report(Request $request)
    {
        $request->validate([
            'period' => 'required|in:daily,weekly,monthly',
            'date'   => 'nullable|date',
        ]);

        $date   = $request->date ? Carbon::parse($request->date) : Carbon::now('UTC');
        $period = $request->period;

        switch ($period) {
            case 'daily':
                $from = $date->copy()->startOfDay();
                $to   = $date->copy()->endOfDay();
                break;
            case 'weekly':
                $from = $date->copy()->startOfWeek(Carbon::MONDAY);
                $to   = $date->copy()->endOfWeek(Carbon::SUNDAY);
                break;
            case 'monthly':
                $from = $date->copy()->startOfMonth();
                $to   = $date->copy()->endOfMonth();
                break;
        }

        $fromDate = $from->toDateString();
        $toDate   = $to->toDateString();

        $entries = AccountingEntry::with(['concept', 'product'])
            ->whereBetween('entry_date', [$fromDate, $toDate])
            ->orderBy('entry_date', 'desc')
            ->orderBy('created_at', 'desc')
            ->get();

        $byConcept = AccountingEntry::with('concept')
            ->whereBetween('entry_date', [$fromDate, $toDate])
            ->selectRaw('concept_id, type, SUM(amount) as total, COUNT(*) as count')
            ->groupBy('concept_id', 'type')
            ->get()
            ->map(fn($r) => [
                'concept' => $r->concept?->name ?? 'Sin concepto',
                'type'    => $r->type,
                'total'   => round($r->total, 2),
                'count'   => $r->count,
            ]);

        $totalIngresos = $entries->where('type', 'ingreso')->sum('amount');
        $totalEgresos  = $entries->where('type', 'egreso')->sum('amount');

        return response()->json([
            'period'         => $period,
            'from'           => $fromDate,
            'to'             => $toDate,
            'total_ingresos' => round($totalIngresos, 2),
            'total_egresos'  => round($totalEgresos, 2),
            'balance'        => round($totalIngresos - $totalEgresos, 2),
            'by_concept'     => $byConcept,
            'entries'        => $entries,
        ]);
    }
}
