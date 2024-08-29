import type { SerializableObject } from 'common/types';
import type { CanvasManager } from 'features/controlLayers/konva/CanvasManager';
import { CanvasModuleABC } from 'features/controlLayers/konva/CanvasModuleABC';
import { CanvasObjectImageRenderer } from 'features/controlLayers/konva/CanvasObjectImageRenderer';
import type { CanvasPreviewModule } from 'features/controlLayers/konva/CanvasPreviewModule';
import { getPrefixedId } from 'features/controlLayers/konva/util';
import { imageDTOToImageWithDims, type StagingAreaImage } from 'features/controlLayers/store/types';
import Konva from 'konva';
import type { Logger } from 'roarr';

export class CanvasStagingAreaModule extends CanvasModuleABC {
  readonly type = 'staging_area';

  id: string;
  path: string[];
  parent: CanvasPreviewModule;
  manager: CanvasManager;
  log: Logger;

  konva: { group: Konva.Group };

  image: CanvasObjectImageRenderer | null;
  selectedImage: StagingAreaImage | null;

  /**
   * A set of subscriptions that should be cleaned up when the transformer is destroyed.
   */
  subscriptions: Set<() => void> = new Set();

  constructor(parent: CanvasPreviewModule) {
    super();
    this.id = getPrefixedId(this.type);
    this.parent = parent;
    this.manager = this.parent.manager;
    this.path = this.manager.path.concat(this.id);
    this.log = this.manager.buildLogger(this.getLoggingContext);

    this.log.debug('Creating staging area module');

    this.konva = { group: new Konva.Group({ name: `${this.type}:group`, listening: false }) };
    this.image = null;
    this.selectedImage = null;

    this.subscriptions.add(this.manager.stateApi.$shouldShowStagedImage.listen(this.render));
  }

  render = async () => {
    this.log.trace('Rendering staging area');
    const session = this.manager.stateApi.getSession();
    const { x, y, width, height } = this.manager.stateApi.getBbox().rect;
    const shouldShowStagedImage = this.manager.stateApi.$shouldShowStagedImage.get();

    this.selectedImage = session.stagedImages[session.selectedStagedImageIndex] ?? null;
    this.konva.group.position({ x, y });

    if (this.selectedImage) {
      const { imageDTO } = this.selectedImage;

      if (!this.image) {
        const { image_name } = imageDTO;
        this.image = new CanvasObjectImageRenderer(
          {
            id: 'staging-area-image',
            type: 'image',
            image: {
              image_name: image_name,
              width,
              height,
            },
          },
          this
        );
        this.konva.group.add(this.image.konva.group);
      }

      if (!this.image.isLoading && !this.image.isError) {
        await this.image.update({ ...this.image.state, image: imageDTOToImageWithDims(imageDTO) }, true);
        this.manager.stateApi.$lastCanvasProgressEvent.set(null);
      }
      this.image.konva.group.visible(shouldShowStagedImage);
    } else {
      this.image?.konva.group.visible(false);
    }
  };

  getNodes = () => {
    return [this.konva.group];
  };

  destroy = () => {
    this.log.debug('Destroying staging area module');
    this.subscriptions.forEach((unsubscribe) => unsubscribe());
    if (this.image) {
      this.image.destroy();
    }
    for (const node of this.getNodes()) {
      node.destroy();
    }
  };

  repr = () => {
    return {
      id: this.id,
      type: this.type,
      path: this.path,
      selectedImage: this.selectedImage,
    };
  };

  getLoggingContext = (): SerializableObject => {
    return { ...this.manager.getLoggingContext(), path: this.path.join('.') };
  };
}