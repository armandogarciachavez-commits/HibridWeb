<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AccountingConcept extends Model
{
    protected $fillable = ['name', 'type', 'description', 'is_active'];

    protected $casts = ['is_active' => 'boolean'];

    public function entries()
    {
        return $this->hasMany(AccountingEntry::class, 'concept_id');
    }
}
