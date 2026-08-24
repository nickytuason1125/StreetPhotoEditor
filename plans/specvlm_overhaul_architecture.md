# SpecVLM Frontier Transition - Architecture Plan

## Executive Summary

Overhaul the current multi-model ensemble (SigLIP-So400M/Q-Align) to a High-Speed Speculative Decoding pipeline using TensorRT-LLM 2026 kernels, optimized for 4-6GB VRAM laptop GPUs.

---

## PHASE 1: ARCHITECTURAL SWAP

### 1.1 SigLIP-2 ViT-g/14 NaFlex Integration

**Current**: SigLIP-So400M (1152-d embeddings)  
**Target**: SigLIP-2 ViT-g/14 (NaFlex, FP8 quantized)

**Key Improvements**:
- Native aspect ratio preservation (fixes compositional "squishing")
- FP8 quantization for faster inference
- Larger model capacity for better embeddings

**Implementation**:
```python
# New file: src/siglip2_encoder.py
class SigLIP2Encoder:
    def __init__(self, device="auto", quantize=True):
        # Load SigLIP-2 ViT-g/14 NaFlex with FP8
        self.model, _, self.preprocess = open_clip.create_model_and_transforms(
            "ViT-g-14", 
            pretrained="naflex_fp8",
            precision="fp8"
        )
        # Native aspect ratio: no forced square cropping
        self.preprocess.transforms[-1] = ResizePad()  # New transform
    
    def encode_images(self, paths):
        # Process without aspect ratio distortion
        pass
```

### 1.2 SpecVLM Draft-and-Verify Pipeline

**Architecture**:
```
┌─────────────────────────────────────────────────────────────┐
│                    SpecVLM Pipeline                         │
├─────────────────────────────────────────────────────────────┤
│ 1. Bulk Encoder (SigLIP-2 ViT-g/14) → Embeddings            │
│ 2. Priority-Gate Controller                                 │
│    ├─ Draft Model (DeepSeek-R1-Distill-Qwen-1.5B INT4)     │
│    │   └─ → Confidence > 0.88? → SKIP 7B                   │
│    └─ Verify Model (DeepSeek-R1-Distill-Qwen-7B INT4)      │
│        └─ → Only triggered when confidence ≤ 0.88          │
│ 3. Reasoning Log Aggregation                                │
│ 4. Score Calculation (weighted ensemble)                    │
└─────────────────────────────────────────────────────────────┘
```

**Implementation**:
```python
# New file: src/specvlm_pipeline.py
class SpecVLM:
    def __init__(self):
        self.draft_model = DraftModel("DeepSeek-R1-Distill-Qwen-1.5B-INT4")
        self.verify_model = VerifyModel("DeepSeek-R1-Distill-Qwen-7B-INT4")
        self.priority_gate = PriorityGate(threshold=0.88)
    
    def grade(self, image_path):
        # Step 1: Draft inference
        draft_result = self.draft_model.infer(image_path)
        
        # Step 2: Priority gate check
        if self.priority_gate.should_skip(draft_result.confidence):
            return draft_result  # Skip verification
        
        # Step 3: Verify inference
        verify_result = self.verify_model.infer(image_path)
        
        # Step 4: Merge results
        return self.merge_results(draft_result, verify_result)
```

---

## PHASE 2: VRAM MODULARITY & SPECULATIVE LOGIC

### 2.1 Priority-Gate Controller

**Logic**:
```python
class PriorityGate:
    def __init__(self, threshold=0.88):
        self.threshold = threshold
    
    def should_skip(self, confidence: float) -> bool:
        """Return True if we can skip the 7B verifier."""
        return confidence > self.threshold
    
    def trigger_verification(self, confidence: float) -> bool:
        """Return True if verification should be triggered."""
        return confidence <= self.threshold
```

### 2.2 Memory Guard Implementation

**VRAM Management Protocol**:
```python
# New file: src/vram_manager.py
class VRAMManager:
    @staticmethod
    def clear_between_phases():
        """Force cleanup between Bulk Encoder and Reasoning phases."""
        torch.cuda.empty_cache()
        gc.collect()
    
    @staticmethod
    def get_vram_usage() -> dict:
        """Return current VRAM usage statistics."""
        if torch.cuda.is_available():
            return {
                "total": torch.cuda.get_device_properties(0).total_memory,
                "allocated": torch.cuda.memory_allocated(),
                "reserved": torch.cuda.memory_reserved(),
            }
        return {}
```

**Pipeline Integration**:
```python
def run_specvlm_pipeline(images: list[str]):
    # Phase 1: Bulk encoding
    encoder = SigLIP2Encoder()
    embeddings = encoder.encode_images(images)
    
    # Memory guard: clear VRAM before reasoning phase
    vram_manager.clear_between_phases()
    
    # Phase 2: Speculative decoding
    specvlm = SpecVLM()
    results = [specvlm.grade(path) for path in images]
    
    return results
```

---

## PHASE 3: OPTIMIZATION UPGRADE

### 3.1 NSGA-III with Pymoo

**Current**: MOGCO-II (custom greedy)  
**Target**: NSGA-III via Pymoo

**Objectives**:
1. **Reasoning_Accuracy** - Quality of VLM reasoning logs
2. **Semantic_Vibe** - Thematic consistency across sequence
3. **Portfolio_Diversity** - Visual diversity (cosine distance)
4. **Aspect_Ratio_Balance** - Variety of aspect ratios

**Implementation**:
```python
# New file: src/nsga3_sequencer.py
from pymoo.algorithms.moo.nsga3 import NSGA3
from pymoo.problems.static import StaticProblem
from pymoo.optimize import minimize

class SequenceOptimizationProblem:
    def __init__(self, candidates, target_size):
        self.candidates = candidates
        self.target_size = target_size
    
    def _evaluate(self, X, out, *args, **kwargs):
        # X: population of sequence configurations
        # Return 4 objectives (minimize all)
        f1 = self.reasoning_accuracy(X)  # Maximize → negate
        f2 = self.semantic_vibe(X)       # Maximize → negate
        f3 = self.portfolio_diversity(X) # Maximize → negate
        f4 = self.aspect_ratio_balance(X) # Maximize → negate
        
        out["F"] = np.column_stack([-f1, -f2, -f3, -f4])

# Integration with existing pipeline
def run_nsga3_sequence(candidates, target=5):
    problem = SequenceOptimizationProblem(candidates, target)
    algorithm = NSGA3(pop_size=100, ref_dirs=ref_dirs)
    res = minimize(problem, algorithm, ("n_gen", 50))
    return res.X
```

### 3.2 TensorRT-LLM Integration

**Fused Attention Kernels**:
```python
# New file: src/tensorrt_engine.py
import tensorrt as trt

class TensorRTEngine:
    def __init__(self, engine_path):
        self.logger = trt.Logger(trt.Logger.INFO)
        with open(engine_path, "rb") as f:
            self.runtime = trt.Runtime(self.logger)
            self.engine = self.runtime.deserialize_cuda_engine(f.read())
        self.context = self.engine.create_execution_context()
    
    def infer(self, input_tensor):
        # Use fused attention for sub-800ms inference
        self.context.execute_v2([input_tensor.data_ptr()])
        return self.context.get_output_tensor(0)
```

**Optimization Targets**:
- Batch size: 1-4 (laptop GPU constraint)
- Precision: FP16/INT8 mixed
- Fused attention: enabled
- KV cache: enabled for speculative decoding

---

## PHASE 4: MIGRATION & CLEANUP

### 4.1 Embedding Migration to LanceDB IVF-PQ

**Current**: SQLite/FAISS  
**Target**: LanceDB with IVF-PQ indexing

**Schema**:
```python
# New file: src/lance_migration.py
import lancedb
import pyarrow as pa

def migrate_to_lancedb():
    # Open existing SQLite/FAISS
    old_db = OldEmbeddingDB()
    
    # Connect to LanceDB
    db = lancedb.connect("cache/lancedb_v2")
    
    # Create IVF-PQ index
    schema = pa.schema([
        pa.field("path", pa.string()),
        pa.field("embedding", pa.list_(pa.float32(), 1536)),  # SigLIP-2 dim
        pa.field("score", pa.float32()),
        pa.field("reasoning_log", pa.string()),  # New: VLM reasoning
        pa.field("grade", pa.string()),
    ])
    
    table = db.create_table("photos_v2", schema=schema)
    
    # Migrate data in batches
    for batch in old_db.iter_batches(batch_size=1000):
        table.add(batch)
    
    # Create IVF-PQ index
    table.create_index(
        metric="cosine",
        index_type="IVF_PQ",
        num_partitions=16,
        num_sub_vectors=96
    )
```

### 4.2 Legacy Model Deprecation

**Models to Deprecate**:
- NIMA (replaced by Q-Align)
- MobileViT (replaced by SigLIP-2)
- DINOv2-small (replaced by SigLIP-2)

**Cleanup Plan**:
```python
# Update: src/model_loader.py
def get_sessions():
    # Remove NIMA, MobileViT, DINOv2 loading
    # Keep only SigLIP-2 and SpecVLM models
    pass

# Update: src/lightweight_analyzer.py
class LightweightStreetScorer:
    def __init__(self):
        # Remove old model references
        # self.nima_session = None
        # self.mobilevit_session = None
        # self.dinov2_session = None
        
        # Add new SpecVLM reference
        self.specvlm = SpecVLM()
```

---

## File Structure Changes

### New Files
```
src/
├── siglip2_encoder.py          # SigLIP-2 ViT-g/14 encoder
├── specvlm_pipeline.py         # Draft-and-Verify pipeline
├── priority_gate.py            # Confidence-based gate controller
├── vram_manager.py             # VRAM cleanup utilities
├── nsga3_sequencer.py          # NSGA-III optimization
├── tensorrt_engine.py          # TensorRT-LLM inference
├── lance_migration.py          # Embedding migration utilities
└── deepseek_model.py           # Draft/Verify model wrappers
```

### Modified Files
```
src/
├── model_loader.py             # Remove legacy models
├── lightweight_analyzer.py     # Integrate SpecVLM
├── grade_pipeline_v2.py        # Update to SpecVLM pipeline
├── mogco_engine.py             # Replace with NSGA-III
└── server.py                   # Update endpoints
```

### Removed Files (Deprecated)
```
src/
├── qalign_grader.py            # Replaced by SpecVLM
├── siglip_encoder.py           # Replaced by siglip2_encoder.py
├── personal_head.py            # Replaced by VLM reasoning
└── mogco_engine.py             # Replaced by nsga3_sequencer.py
```

---

## Performance Targets

| Metric | Current | Target | Improvement |
|--------|---------|--------|-------------|
| Inference per image | ~2.5s | <800ms | 3.1× faster |
| VRAM usage | ~4.5GB | ~3.5GB | 22% reduction |
| Sequence generation | ~15s | ~8s | 1.9× faster |
| Embedding dimension | 1152 | 1536 | +33% capacity |

---

## Risk Mitigation

1. **VRAM Overflow**: Implement progressive loading with `torch.cuda.empty_cache()`
2. **Model Loading**: Lazy load SpecVLM models only when needed
3. **Backward Compatibility**: Keep legacy grading as fallback option
4. **Testing**: Add integration tests for each phase

---

## Implementation Order

1. **Week 1**: SigLIP-2 encoder + aspect ratio fix
2. **Week 2**: SpecVLM draft/verify pipeline
3. **Week 3**: Priority-Gate + VRAM manager
4. **Week 4**: NSGA-III integration
5. **Week 5**: TensorRT-LLM optimization
6. **Week 6**: Migration + cleanup
7. **Week 7**: Testing + documentation
