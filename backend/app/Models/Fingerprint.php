<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Fingerprint extends Model
{
    protected $fillable = ['user_id', 'template_data', 'finger_index', 'is_active'];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
