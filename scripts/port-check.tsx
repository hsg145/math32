/**
 * The "ours" half of the fidelity harness — exports everything
 * scripts/verify-port.mjs compares against the original single-file quiz.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { Figure, NumberLine } from '../src/lib/graph';
import { fmtLine } from '../src/lib/format';
import { QUESTION_BANK } from '../src/data/questionBank';

const renderFigure = (spec: unknown) =>
  spec ? renderToStaticMarkup(<Figure spec={spec as never} />) : '';

const renderNumberLine = (spec: unknown) =>
  spec ? renderToStaticMarkup(<NumberLine spec={spec as never} />) : '';

export { QUESTION_BANK, fmtLine, renderFigure, renderNumberLine };