<?php

namespace App\Http\Controllers;

use App\Models\Announcement;
use Illuminate\Http\Request;

class AnnouncementController extends Controller
{
    // Socios: anuncios activos y no expirados
    public function index()
    {
        return response()->json(
            Announcement::active()->orderByDesc('created_at')->get(['id', 'title', 'body', 'image', 'created_at'])
        );
    }

    // Admin: todos los anuncios
    public function adminIndex()
    {
        return response()->json(
            Announcement::orderByDesc('created_at')->get()
        );
    }

    public function store(Request $request)
    {
        $request->validate([
            'title'        => 'required|string|max:255',
            'body'         => 'nullable|string',
            'image'        => 'nullable|string',
            'is_active'    => 'boolean',
            'published_at' => 'nullable|date',
            'expires_at'   => 'nullable|date',
        ]);

        $ann = Announcement::create([
            'title'        => $request->title,
            'body'         => $request->body,
            'image'        => $request->image,
            'is_active'    => $request->boolean('is_active', true),
            'published_at' => $request->published_at,
            'expires_at'   => $request->expires_at,
            'created_by'   => $request->user()->id,
        ]);

        return response()->json($ann, 201);
    }

    public function update(Request $request, $id)
    {
        $ann = Announcement::findOrFail($id);

        $request->validate([
            'title'        => 'sometimes|string|max:255',
            'body'         => 'nullable|string',
            'image'        => 'nullable|string',
            'is_active'    => 'boolean',
            'published_at' => 'nullable|date',
            'expires_at'   => 'nullable|date',
        ]);

        $ann->update($request->only(['title', 'body', 'image', 'is_active', 'published_at', 'expires_at']));

        return response()->json($ann);
    }

    public function toggle($id)
    {
        $ann = Announcement::findOrFail($id);
        $ann->update(['is_active' => !$ann->is_active]);
        return response()->json($ann);
    }

    public function destroy($id)
    {
        Announcement::findOrFail($id)->delete();
        return response()->json(['message' => 'Anuncio eliminado']);
    }
}
