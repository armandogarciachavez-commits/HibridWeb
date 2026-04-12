<?php

namespace App\Http\Controllers;

use App\Models\Product;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    public function index()
    {
        return response()->json(Product::orderBy('name')->get());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name'        => 'required|string|max:120',
            'description' => 'nullable|string|max:255',
            'price'       => 'required|numeric|min:0',
            'stock'       => 'required|integer|min:0',
            'unit'        => 'nullable|string|max:40',
        ]);
        $data['unit'] = $data['unit'] ?? 'pieza';
        $product = Product::create($data);
        return response()->json($product, 201);
    }

    public function update(Request $request, $id)
    {
        $product = Product::findOrFail($id);
        $data = $request->validate([
            'name'        => 'sometimes|string|max:120',
            'description' => 'nullable|string|max:255',
            'price'       => 'sometimes|numeric|min:0',
            'stock'       => 'sometimes|integer|min:0',
            'unit'        => 'nullable|string|max:40',
            'is_active'   => 'sometimes|boolean',
        ]);
        $product->update($data);
        return response()->json($product);
    }

    public function destroy($id)
    {
        $product = Product::findOrFail($id);
        $product->update(['is_active' => false]);
        return response()->json(['message' => 'Producto desactivado.']);
    }

    public function adjustStock(Request $request, $id)
    {
        $product = Product::findOrFail($id);
        $data = $request->validate([
            'adjustment' => 'required|integer',
            'notes'      => 'nullable|string|max:255',
        ]);
        $newStock = $product->stock + $data['adjustment'];
        if ($newStock < 0) {
            return response()->json(['message' => 'Stock insuficiente para este ajuste.'], 422);
        }
        $product->update(['stock' => $newStock]);
        return response()->json($product);
    }

    public function generateCatalog()
    {
        $defaults = [
            ['name' => 'Proteína Whey',         'description' => 'Proteína de suero de leche',          'price' => 650.00, 'stock' => 0, 'unit' => 'pieza'],
            ['name' => 'Proteína Vegana',        'description' => 'Proteína de origen vegetal',          'price' => 700.00, 'stock' => 0, 'unit' => 'pieza'],
            ['name' => 'Creatina',               'description' => 'Monohidrato de creatina 300g',        'price' => 350.00, 'stock' => 0, 'unit' => 'pieza'],
            ['name' => 'Pre-Workout',            'description' => 'Suplemento energético pre-entreno',   'price' => 450.00, 'stock' => 0, 'unit' => 'pieza'],
            ['name' => 'BCAA',                   'description' => 'Aminoácidos de cadena ramificada',    'price' => 380.00, 'stock' => 0, 'unit' => 'pieza'],
            ['name' => 'Multivitamínico',        'description' => 'Vitaminas y minerales diarios',       'price' => 220.00, 'stock' => 0, 'unit' => 'pieza'],
            ['name' => 'Quemador de grasa',      'description' => 'Termogénico para pérdida de peso',   'price' => 480.00, 'stock' => 0, 'unit' => 'pieza'],
            ['name' => 'Colágeno hidrolizado',   'description' => 'Colágeno para articulaciones',       'price' => 300.00, 'stock' => 0, 'unit' => 'pieza'],
            ['name' => 'Shaker / Vaso mezclador','description' => 'Botella con malla mezcladora 600ml', 'price' => 120.00, 'stock' => 0, 'unit' => 'pieza'],
            ['name' => 'Guantes de gimnasio',    'description' => 'Guantes con soporte de muñeca',      'price' => 180.00, 'stock' => 0, 'unit' => 'pieza'],
            ['name' => 'Rodilleras',             'description' => 'Rodilleras de compresión par',       'price' => 150.00, 'stock' => 0, 'unit' => 'par'],
            ['name' => 'Cinturón lumbar',        'description' => 'Cinturón de levantamiento',          'price' => 280.00, 'stock' => 0, 'unit' => 'pieza'],
            ['name' => 'Cuerda para saltar',     'description' => 'Cuerda ajustable de velocidad',      'price' => 90.00,  'stock' => 0, 'unit' => 'pieza'],
            ['name' => 'Toalla de gym',          'description' => 'Toalla microfibra 40×80cm',          'price' => 80.00,  'stock' => 0, 'unit' => 'pieza'],
            ['name' => 'Barra de proteína',      'description' => 'Snack proteico por unidad',          'price' => 45.00,  'stock' => 0, 'unit' => 'pieza'],
            ['name' => 'Bebida isotónica',       'description' => 'Bebida deportiva 600ml',             'price' => 30.00,  'stock' => 0, 'unit' => 'pieza'],
        ];

        $created = 0;
        foreach ($defaults as $item) {
            $exists = Product::where('name', $item['name'])->exists();
            if (!$exists) {
                Product::create($item);
                $created++;
            }
        }

        return response()->json([
            'message' => $created > 0
                ? "Se generaron {$created} productos del catálogo base."
                : 'El catálogo ya estaba completo. No se duplicaron productos.',
            'created' => $created,
        ]);
    }
}
