import React from 'react';
import {render,screen,fireEvent,act,cleanup} from '@testing-library/react';
import api from '../api/axiosInstance';
import DrugSearchInput from '../components/DrugSearchInput';
const {analyzeMedicationSafety}=require('../../../server/src/utils/ingredientResolver');
jest.mock('../api/axiosInstance',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn()}}));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const response=data=>({data:{data}});
const complete=()=>analyzeMedicationSafety(['Paracetamol','Cetirizine'],[],[]);
const select=name=>{const input=screen.getByRole('combobox');fireEvent.change(input,{target:{value:name}});fireEvent.keyDown(input,{key:'Enter'});};
beforeEach(()=>{jest.useFakeTimers();api.post.mockReset();api.get.mockReset();api.get.mockResolvedValue({data:{data:[]}});});
afterEach(()=>{cleanup();jest.useRealTimers();});

test('a stale medication reply cannot replace the current selection allergy warning',async()=>{
  const old=deferred();api.post.mockReturnValueOnce(old.promise);
  render(<DrugSearchInput patientAllergies={['OwnedBeta']} onSelect={jest.fn()}/>);
  select('OwnedAlpha');select('OwnedBeta');
  expect(screen.getByText(/ALLERGY:/)).toBeInTheDocument();expect(api.post).toHaveBeenCalledTimes(1);
  await act(async()=>old.resolve(response(analyzeMedicationSafety(['Warfarin','Aspirin'],[],[]))));
  expect(screen.getByText(/ALLERGY:/)).toBeInTheDocument();expect(screen.queryByText(/MEDICATION SAFETY ALERT:/)).not.toBeInTheDocument();
});

test.each(['reply','reject'])('obsolete interaction %s cannot overwrite a later completed selection',async(outcome)=>{
  const old=deferred();api.post.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response(complete()));
  render(<DrugSearchInput onSelect={jest.fn()}/>);select('OwnedAlpha');select('OwnedBeta');
  await act(async()=>{});
  await act(async()=>outcome==='reject'?old.reject(Error('inert-failure')):old.resolve(response(analyzeMedicationSafety(['OwnedUnknownFixture'],[],[]))));
  expect(screen.getByTestId('drug-search-warnings')).toBeEmptyDOMElement();
});

test.each([undefined,{}, {hasInteraction:false,warnings:[]}, {hasInteraction:true,warnings:[],verificationIncomplete:false,unresolvedIngredients:[]}, {hasInteraction:false,warnings:[],verificationIncomplete:true,unresolvedIngredients:[],statusMessage:{unsafe:'inert'}}])('malformed interaction reply is explicitly unavailable %#',async(payload)=>{
  api.post.mockResolvedValueOnce(response(payload));render(<DrugSearchInput onSelect={jest.fn()}/>);select('OwnedAlpha');await act(async()=>{});
  expect(screen.getByTestId('drug-search-warnings')).toHaveTextContent('Automated interaction checking could not be completed due to a service error.');
});

test('actual server single-medication incomplete result remains visible with no unresolved ingredient',async()=>{
  const data=analyzeMedicationSafety(['Paracetamol'],[],[]);expect(data.verificationIncomplete).toBe(true);expect(data.unresolvedIngredients).toEqual([]);
  api.post.mockResolvedValueOnce(response(data));render(<DrugSearchInput onSelect={jest.fn()}/>);select('Paracetamol');await act(async()=>{});
  expect(screen.getByTestId('drug-search-warnings')).toHaveTextContent(data.statusMessage);
});

test('actual server interaction warning is rendered without altering its reference message',async()=>{
  const data=analyzeMedicationSafety(['Warfarin','Aspirin'],[],[]);expect(data.hasInteraction).toBe(true);
  api.post.mockResolvedValueOnce(response(data));render(<DrugSearchInput onSelect={jest.fn()}/>);select('Aspirin');await act(async()=>{});
  expect(screen.getByTestId('drug-search-warnings')).toHaveTextContent(data.warnings[0].message);
});
