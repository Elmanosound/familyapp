# Fine-tuning FamilyBot — Guide complet

Ce dossier contient tout ce qu'il faut pour adapter un modèle à FamilyBot.

## Fichiers

| Fichier | Rôle |
|---|---|
| `generate_dataset.py` | Génère `familybot_dataset.jsonl` |
| `familybot_dataset.jsonl` | Dataset prêt à l'emploi (69 exemples) |
| `finetune_colab.ipynb` | Notebook Google Colab (Unsloth + LoRA) |

---

## 1. Modèle cible

**Mistral 3B** (ministralai/Ministral-3B-Instruct-2410) — le même modèle déjà chargé dans LM Studio.

L'objectif est une adaptation légère par **LoRA** (faible VRAM, rapide) puis export en **GGUF Q4_K_M** pour LM Studio.

---

## 2. Régénérer le dataset

Si vous avez ajouté de nouvelles fonctionnalités à FamilyApp :

```bash
cd fine-tuning
python -X utf8 generate_dataset.py
# → familybot_dataset.jsonl (69+ exemples, ~80 Ko)
```

---

## 3. Fine-tuning sur Google Colab (gratuit)

### Prérequis
- Compte Google (Drive activé)
- Colab gratuit suffit pour 3B avec LoRA (T4 16 GB)

### Étapes

#### 3a. Préparer Drive
1. Créer un dossier `FamilyBot/` dans Google Drive
2. Y déposer `familybot_dataset.jsonl`

#### 3b. Ouvrir le notebook Colab
Créez un nouveau notebook et collez le code ci-dessous section par section.

---

### Code Colab complet

#### Cellule 1 — Installation
```python
%%capture
!pip install unsloth
!pip install xformers trl peft accelerate bitsandbytes
```

#### Cellule 2 — Chargement du modèle (4-bit)
```python
from unsloth import FastLanguageModel
import torch

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name   = "unsloth/Ministral-3b-bnb-4bit",
    max_seq_length = 2048,
    dtype          = None,   # auto
    load_in_4bit   = True,
)
```

#### Cellule 3 — Ajout des adaptateurs LoRA
```python
model = FastLanguageModel.get_peft_model(
    model,
    r              = 16,          # rang LoRA (16 = bon équilibre)
    target_modules = ["q_proj", "k_proj", "v_proj", "o_proj",
                       "gate_proj", "up_proj", "down_proj"],
    lora_alpha     = 16,
    lora_dropout   = 0,
    bias           = "none",
    use_gradient_checkpointing = "unsloth",
    random_state   = 42,
)
```

#### Cellule 4 — Chargement du dataset
```python
from google.colab import drive
drive.mount('/content/drive')

from datasets import load_dataset

dataset = load_dataset(
    "json",
    data_files = "/content/drive/MyDrive/FamilyBot/familybot_dataset.jsonl",
    split      = "train",
)
print(f"Dataset : {len(dataset)} exemples")
```

#### Cellule 5 — Formatage (ChatML)
```python
from unsloth.chat_templates import get_chat_template

tokenizer = get_chat_template(
    tokenizer,
    chat_template = "chatml",   # Mistral utilise ChatML
    mapping       = {"role": "role", "content": "content"},
)

def apply_template(examples):
    messages = examples["messages"]
    texts = [
        tokenizer.apply_chat_template(
            m,
            tokenize         = False,
            add_generation_prompt = False,
        )
        for m in messages
    ]
    return {"text": texts}

dataset = dataset.map(apply_template, batched=True)
```

#### Cellule 6 — Entraînement
```python
from trl import SFTTrainer
from transformers import TrainingArguments

trainer = SFTTrainer(
    model         = model,
    tokenizer     = tokenizer,
    train_dataset = dataset,
    dataset_text_field = "text",
    max_seq_length = 2048,
    args = TrainingArguments(
        per_device_train_batch_size = 2,
        gradient_accumulation_steps = 4,
        num_train_epochs            = 3,
        learning_rate               = 2e-4,
        fp16                        = not torch.cuda.is_bf16_supported(),
        bf16                        = torch.cuda.is_bf16_supported(),
        logging_steps               = 10,
        output_dir                  = "/content/drive/MyDrive/FamilyBot/checkpoints",
        save_strategy               = "epoch",
        warmup_ratio                = 0.1,
        lr_scheduler_type           = "cosine",
        optim                       = "adamw_8bit",
        seed                        = 42,
    ),
)

trainer.train()
```

> ⏱ Durée estimée : ~15–25 min sur T4 (Colab gratuit)

#### Cellule 7 — Export GGUF (pour LM Studio)
```python
# Q4_K_M = bon ratio qualité/taille pour un NAS
model.save_pretrained_gguf(
    "/content/drive/MyDrive/FamilyBot/familybot-3b-Q4_K_M",
    tokenizer,
    quantization_method = "q4_k_m",
)
print("Export terminé !")
```

Le fichier `.gguf` apparaît dans `FamilyBot/familybot-3b-Q4_K_M/` sur Drive.

---

## 4. Charger le modèle dans LM Studio

1. **Télécharger** le fichier `.gguf` depuis Google Drive vers le NAS
2. Dans LM Studio → **My Models** → **Add model from file**
3. Sélectionner le fichier `.gguf`
4. Dans FamilyApp → Chat → sélectionner le nouveau modèle

### Template de chat
LM Studio doit utiliser le template **ChatML** (auto-détecté via le fichier `tokenizer_config.json` joint à l'export). Si ce n'est pas le cas, forcer :
```
<|im_start|>system
{system}<|im_end|>
<|im_start|>user
{user}<|im_end|>
<|im_start|>assistant
```

---

## 5. Améliorer le dataset

Pour de meilleurs résultats, enrichissez le dataset avant de relancer l'entraînement :

### Ajouter des exemples réels
```python
# Dans generate_dataset.py, ajoutez à la liste EXAMPLES :
{"messages": [
    {"role": "system",  "content": BASE},
    {"role": "user",    "content": "Votre vraie question utilisateur"},
    {"role": "assistant","content": "La réponse idéale que vous voulez"},
]}
```

### Conseils
- **Quantité** : 100–200 exemples donnent un modèle nettement meilleur
- **Diversité** : variez la formulation des mêmes demandes
- **Cohérence** : le ton doit toujours être concis, utile, en français
- **Négatifs** : incluez des cas hors-périmètre pour que le bot sache refuser poliment

---

## 6. Résumé rapide

```
generate_dataset.py → familybot_dataset.jsonl
        ↓
  Google Colab (Unsloth + LoRA, ~20 min)
        ↓
  Export GGUF Q4_K_M (~2 GB)
        ↓
  LM Studio → FamilyApp
```
