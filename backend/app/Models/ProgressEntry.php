<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProgressEntry extends Model
{
    protected $fillable = ['user_id', 'date', 'reps', 'distance', 'notes'];

    protected $casts = [
        'date'     => 'date:Y-m-d',
        'reps'     => 'integer',
        'distance' => 'float',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
