"""
routes/network.py
Returns network graph data for frontend visualization.
"""
from fastapi import APIRouter, HTTPException
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from services.data_processor import processor
from services.network_builder import network_builder

router = APIRouter()


@router.get("/graph")
def get_network_graph():
    if processor.cdr_df is None:
        raise HTTPException(400, "No data loaded. Upload CDR first.")

    df = processor.merged_df if processor.merged_df is not None else processor.cdr_df

    graph = network_builder.build_graph(
        merged_df=df,
        cdr_df=processor.cdr_df,
        tower_df=processor.tower_df,
        ipdr_df=processor.ipdr_df,
    )
    return graph