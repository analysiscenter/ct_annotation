import os
import sys
import gzip
from time import time

import numpy as np
import pandas as pd
import glob


CURRENT_PATH = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(1, os.path.join(CURRENT_PATH, "radio"))
from radio import CTImagesMaskedBatch as CTIMB
from radio.batchflow import FilesIndex, Pipeline, Dataset, V, B, F


# item demonstration
RENDER_SHAPE = (128, 256, 256)

# inference
SHAPE = (256, 384, 384)
SPACING = (1.7, 1., 1.)

RENDER_SPACING = np.array(SHAPE) / np.array(RENDER_SHAPE) * np.array(SPACING)

# xip parameters
XIP_PARAMS = dict(mode='max', depth=6, stride=2, channels=3)

def get_pixel_coords(nodules, factor=1):
    """ Get nodules info in pixel coords from nodules recarray.
    """
    coords = (nodules.nodule_center - nodules.origin) / nodules.spacing
    diams = np.ceil(nodules.nodule_size / nodules.spacing)
    nodules = np.rint(np.hstack([coords, diams]) * factor).astype(np.int)
    return nodules

def get_selected_lunaixs():
    return ["1.3.6.1.4.1.14519.5.2.1.6279.6001.320111824803959660037459294083",
            "1.3.6.1.4.1.14519.5.2.1.6279.6001.141069661700670042960678408762",
            "1.3.6.1.4.1.14519.5.2.1.6279.6001.768276876111112560631432843476",
            "1.3.6.1.4.1.14519.5.2.1.6279.6001.114218724025049818743426522343",
            "1.3.6.1.4.1.14519.5.2.1.6279.6001.240969450540588211676803094518",
            "1.3.6.1.4.1.14519.5.2.1.6279.6001.621916089407825046337959219998",
            "1.3.6.1.4.1.14519.5.2.1.6279.6001.652347820272212119124022644822",
            "1.3.6.1.4.1.14519.5.2.1.6279.6001.200841000324240313648595016964",
            "1.3.6.1.4.1.14519.5.2.1.6279.6001.148229375703208214308676934766",
            "1.3.6.1.4.1.14519.5.2.1.6279.6001.197063290812663596858124411210"]

class CtController:
    def __init__(self, ct_path, model_path, only_selected):
        # associate controller with a dataset of ct-scans
        if isinstance(ct_path, str):
            ct_path = (ct_path, )
        paths = []
        for path in ct_path:
            paths.extend(p for p in glob.glob(path))
        paths = sorted(paths)
        if not paths:
            raise ValueError("A list of paths to CT-scans cannot be empty!")

        # filter scans if needed
        if bool(only_selected):
            selected = get_selected_lunaixs()
            mask = np.array([p.split(os.sep)[-1] in selected for p in paths])
            paths = np.array(paths)[mask]

        # set names for scans
        key_len = len(str(len(paths)))
        self.ct_dict = {str(i + 1).zfill(key_len): f for i, f in enumerate(paths)}

        # set up scan-rendering pipeline
        BATCH_SIZE = 1
        self.ppl_render_scan = (Pipeline()
                                .load(fmt='blosc', components=['images', 'spacing', 'origin'])
                                .resize(shape=RENDER_SHAPE)  # if scans in blosc already have same spacings
                                # .unify_spacing(shape=RENDER_SHAPE, spacing=RENDER_SPACING, padding=0) # assume scans are normalized
                                .run(batch_size=BATCH_SIZE, shuffle=False, drop_last=False, n_epochs=1, lazy=True))

        # inference pipeline

    def build_item_ds(self, data):
        item_id = data.get('id')
        path = self.ct_dict.get(item_id)
        return Dataset(index=FilesIndex(path=path, dirs=True), batch_class=CTIMB)

    def get_list(self, data, meta):
        ct_list = [dict(name='Patient ' + key, id=key) for key in sorted(self.ct_dict)]
        return dict(data=ct_list, meta=meta)

    def get_item_data(self, data, meta):
        item_ds = self.build_item_ds(data)
        batch = (item_ds >> self.ppl_render_scan).next_batch()
        image = gzip.compress(batch.images.astype(np.uint8))
        spacing = tuple([float(i) for i in batch.spacing[0]])
        item_data = dict(image=image, shape=batch.images.shape, spacing=spacing)
        return dict(data={**item_data, **data}, meta=meta)

    def get_inference(self, data, meta):
        # perform inference
        print('Predicting...')
        item_ds = self.build_item_ds(data)
        predict = item_ds >> self.ppl_predict_scan
        batch = predict.next_batch()

        # nodules in pixel coords
        f = np.tile(RENDER_SHAPE, 2) / np.tile(batch.get(0, 'images').shape, 2)
        nodules_true = get_pixel_coords(predict.get_variable('nodules_true'), f)
        nodules_predicted = get_pixel_coords(predict.get_variable('nodules_predicted'), f)

        item_data = dict(nodules_true=nodules_true.tolist(), nodules_predicted=nodules_predicted.tolist())

        # update and fetch data dict
        print('Finished predicting')
        res = dict(data={**item_data, **data}, meta=meta)
        return res
