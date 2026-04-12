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
}
